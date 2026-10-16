import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import type { DateBounds, InsertResult, Transaction, TxFilters } from "../shared/types.ts";
import { Repository, SqlWhere, type Row, type SqlValue } from "../core/Repository.ts";
import { TransactionFilter } from "./TransactionFilter.ts";

const TEXT_MATCH = "(payee LIKE ? OR title LIKE ? OR description LIKE ? OR type LIKE ?)";

export class TransactionRepository extends Repository {
  static fromRow(row: Row): Transaction {
    return {
      id: String(row.id),
      date: String(row.date),
      bookingDate: String(row.booking_date ?? ""),
      amount: Number(row.amount),
      currency: String(row.currency ?? "PLN"),
      type: String(row.type ?? ""),
      payee: String(row.payee ?? ""),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      accountIban: String(row.account_iban ?? ""),
      accountId: String(row.account_id ?? ""),
      category: String(row.category || DEFAULT_CATEGORY),
      comment: String(row.comment ?? ""),
      excluded: Number(row.excluded || 0) === 1,
      manualCategory: Number(row.manual_category || 0) === 1,
      source: (row.source as Transaction["source"]) || "csv",
      externalId: String(row.external_id ?? ""),
      createdAt: String(row.created_at ?? ""),
    };
  }

  /** Skips rows whose id already exists; `replaceCsvFor` first drops that account's CSV payments. */
  insertMany(items: Transaction[], options: { replaceCsvFor?: string } = {}): InsertResult {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO transactions
      (id, date, booking_date, amount, currency, type, payee, title, description, account_iban, account_id,
       category, comment, excluded, manual_category, source, external_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const ids: string[] = [];
    this.transaction(() => {
      if (options.replaceCsvFor) {
        this.run("DELETE FROM transactions WHERE source = 'csv' AND account_id = ?", options.replaceCsvFor);
      }
      for (const item of items) {
        const result = insert.run(
          item.id,
          item.date,
          item.bookingDate,
          item.amount,
          item.currency,
          item.type,
          item.payee,
          item.title,
          item.description,
          item.accountIban,
          item.accountId,
          item.category,
          item.comment || "",
          item.excluded ? 1 : 0,
          item.manualCategory ? 1 : 0,
          item.source,
          item.externalId,
          item.createdAt,
        );
        if (Number(result.changes || 0)) ids.push(item.id);
      }
    });
    return { imported: ids.length, skipped: items.length - ids.length, ids };
  }

  /** Ids already in the database; CSV payments of `replaceCsvFor` don't count (`insertMany` drops them first). */
  existingIds(ids: string[], options: { replaceCsvFor?: string } = {}): Set<string> {
    const found = new Set<string>();
    for (let start = 0; start < ids.length; start += 500) {
      const chunk = ids.slice(start, start + 500);
      const keep = options.replaceCsvFor ? " AND NOT (source = 'csv' AND account_id = ?)" : "";
      const extra = options.replaceCsvFor ? [options.replaceCsvFor] : [];
      const rows = this.all(`SELECT id FROM transactions WHERE id IN (${chunk.map(() => "?").join(",")})${keep}`, ...chunk, ...extra);
      for (const row of rows) found.add(String(row.id));
    }
    return found;
  }

  select(where: SqlWhere, suffix = "", ...extra: SqlValue[]): Transaction[] {
    return this.all(`SELECT * FROM transactions WHERE ${where}${suffix}`, ...where.params, ...extra).map(
      TransactionRepository.fromRow,
    );
  }

  /** Only the columns statistics need. */
  selectForStats(where: SqlWhere): { amount: number; category: string; date: string; excluded: number }[] {
    return this.all(`SELECT amount, category, date, excluded FROM transactions WHERE ${where}`, ...where.params);
  }

  monthTotals(where: SqlWhere): { month: string; income: number; expenses: number }[] {
    return this.all(
      `SELECT substr(date, 1, 7) AS month,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE ${where}
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`,
      ...where.params,
    );
  }

  list(filters: TxFilters): { items: Transaction[]; matched: number } {
    const where = TransactionFilter.where(filters);
    const matched = this.count(where);
    const order = TransactionFilter.orderBy(filters.sort);
    const items = this.select(where, ` ORDER BY ${order} LIMIT ?`, filters.limit ?? 5000);
    return { items, matched };
  }

  get(id: string): Transaction {
    const row = this.one("SELECT * FROM transactions WHERE id = ?", id);
    if (!row) throw new Error("Nie znaleziono transakcji");
    return TransactionRepository.fromRow(row);
  }

  listAll(): Transaction[] {
    return this.all("SELECT * FROM transactions").map(TransactionRepository.fromRow);
  }

  setComment(id: string, comment: string): void {
    this.#updateOne("UPDATE transactions SET comment = ? WHERE id = ?", comment, id);
  }

  setExcluded(id: string, excluded: boolean): void {
    this.#updateOne("UPDATE transactions SET excluded = ? WHERE id = ?", excluded ? 1 : 0, id);
  }

  setCategory(id: string, category: string, manual: boolean): void {
    this.run("UPDATE transactions SET category = ?, manual_category = ? WHERE id = ?", category, manual ? 1 : 0, id);
  }

  /** Recategorization keeps the manual flag as it is. */
  updateCategories(updates: { id: string; category: string }[]): void {
    const update = this.db.prepare("UPDATE transactions SET category = ? WHERE id = ?");
    for (const { id, category } of updates) update.run(category, id);
  }

  /** Applies a phrase rule to every matching payment; manual ones only when `force` (which also clears their flag). */
  applyRule(pattern: string, category: string, force: boolean): number {
    const like = `%${pattern}%`;
    const flag = force ? 1 : 0;
    return this.run(
      `UPDATE transactions
       SET category = ?, manual_category = CASE WHEN ? = 1 THEN 0 ELSE manual_category END
       WHERE ${TEXT_MATCH}
         AND (manual_category = 0 OR ? = 1)`,
      category,
      flag,
      like,
      like,
      like,
      like,
      flag,
    );
  }

  /** Manually categorized payments (other than `exceptId`) that a phrase rule would match. */
  countManualMatches(pattern: string, exceptId: string): number {
    const like = `%${pattern}%`;
    return this.count(new SqlWhere(`manual_category = 1 AND id != ? AND ${TEXT_MATCH}`, exceptId, like, like, like, like));
  }

  uncategorized(ids?: string[]): Transaction[] {
    if (ids?.length) {
      return this.select(
        new SqlWhere(`id IN (${ids.map(() => "?").join(",")})`, ...ids).add(TransactionFilter.UNCATEGORIZED, DEFAULT_CATEGORY),
      );
    }
    return this.select(TransactionFilter.uncategorized());
  }

  count(where: SqlWhere): number {
    return Number(this.one<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions WHERE ${where}`, ...where.params)?.n ?? 0);
  }

  countAll(account?: string): number {
    return this.count(new SqlWhere().forAccount(account));
  }

  countUncategorized(account?: string): number {
    return this.count(TransactionFilter.uncategorized(account));
  }

  countExcluded(account?: string): number {
    return this.count(new SqlWhere("excluded = 1").forAccount(account));
  }

  dateBounds(account?: string): DateBounds {
    const where = new SqlWhere().forAccount(account);
    const row = this.one<{ minDate: string | null; maxDate: string | null }>(
      `SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM transactions WHERE ${where}`,
      ...where.params,
    );
    return { minDate: row?.minDate || "", maxDate: row?.maxDate || "" };
  }

  deleteByAccount(accountId: string): number {
    return this.run("DELETE FROM transactions WHERE account_id = ?", accountId);
  }

  deleteDemo(): void {
    this.exec("DELETE FROM transactions WHERE source = 'demo'");
  }

  /** Payments and the legacy bank_accounts table. */
  clear(): void {
    this.exec("DELETE FROM transactions; DELETE FROM bank_accounts;");
  }

  #updateOne(sql: string, ...params: SqlValue[]): void {
    if (!this.run(sql, ...params)) throw new Error("Nie znaleziono transakcji");
  }
}
