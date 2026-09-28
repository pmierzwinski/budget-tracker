import type { SQLInputValue } from "node:sqlite";
import { DEFAULT_CATEGORY, merchantPattern } from "../../shared/domain.ts";
import type { DateBounds, InsertResult, Transaction, TxFilters, TxSort } from "../../shared/types.ts";
import { ensureCategory } from "./categories.ts";
import { changes, db, forAccount, transaction, type Row } from "./core.ts";
import { upsertRule } from "./rules.ts";
import { rowToTx } from "./rows.ts";

const UNCATEGORIZED = "(category = ? OR category = '' OR category IS NULL)";

/** Search box: payment texts and the user's comments. */
const SEARCH_COLUMNS = ["payee", "title", "description", "type", "comment"];

export function insertTransactions(items: Transaction[], options: { replaceCsvFor?: string } = {}): InsertResult {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
    (id, date, booking_date, amount, currency, type, payee, title, description, account_iban, account_id,
     category, comment, excluded, source, external_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids: string[] = [];
  transaction(() => {
    if (options.replaceCsvFor) {
      db.prepare("DELETE FROM transactions WHERE source = 'csv' AND account_id = ?").run(options.replaceCsvFor);
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
        item.source,
        item.externalId,
        item.createdAt,
      );
      if (changes(result)) ids.push(item.id);
    }
  });
  return { imported: ids.length, skipped: items.length - ids.length, ids };
}

export function filterClause(filters: TxFilters): { where: string; params: SQLInputValue[] } {
  const where: string[] = ["1=1"];
  const params: SQLInputValue[] = [];
  if (filters.account) {
    where.push("account_id = ?");
    params.push(filters.account);
  }
  if (filters.from) {
    where.push("date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("date <= ?");
    params.push(filters.to);
  }
  if (filters.category && filters.category !== "Wszystkie") {
    const names = filters.category
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 1) {
      where.push("category = ?");
      params.push(names[0]);
    } else if (names.length > 1) {
      where.push(`category IN (${names.map(() => "?").join(",")})`);
      params.push(...names);
    }
  }
  if (filters.q) {
    where.push(`(${SEARCH_COLUMNS.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    params.push(...SEARCH_COLUMNS.map(() => `%${filters.q}%`));
  }
  if (filters.kind === "expense") where.push("amount < 0");
  if (filters.kind === "income") where.push("amount > 0");
  if (filters.excludedOnly) where.push("excluded = 1");
  if (filters.weekday != null && filters.weekday >= 0 && filters.weekday <= 6) {
    where.push("CAST(strftime('%w', date) AS INTEGER) = ?");
    params.push(filters.weekday);
  }
  if (filters.minAmount != null && !Number.isNaN(filters.minAmount)) {
    where.push("ABS(amount) >= ?");
    params.push(filters.minAmount);
  }
  if (filters.maxAmount != null && !Number.isNaN(filters.maxAmount)) {
    where.push("ABS(amount) <= ?");
    params.push(filters.maxAmount);
  }
  return { where: where.join(" AND "), params };
}

const ORDER_BY: Record<TxSort, string> = {
  date_desc: "date DESC, created_at DESC",
  date_asc: "date ASC, created_at ASC",
  amount_desc: "ABS(amount) DESC, date DESC",
  amount_asc: "ABS(amount) ASC, date DESC",
  category_asc: "category COLLATE NOCASE ASC, ABS(amount) DESC, date DESC",
  category_desc: "category COLLATE NOCASE DESC, ABS(amount) DESC, date DESC",
};

export function selectTransactions(where: string, params: SQLInputValue[], suffix = ""): Transaction[] {
  return (db.prepare(`SELECT * FROM transactions WHERE ${where}${suffix}`).all(...params) as Row[]).map(rowToTx);
}

export function listTransactions(filters: TxFilters): { items: Transaction[]; matched: number } {
  const { where, params } = filterClause(filters);
  const matched = count(where, params);
  const order = ORDER_BY[filters.sort || "date_desc"];
  const items = selectTransactions(where, [...params, filters.limit ?? 5000], ` ORDER BY ${order} LIMIT ?`);
  return { items, matched };
}

function getTransaction(id: string): Transaction {
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Nie znaleziono transakcji");
  return rowToTx(row);
}

function updateOne(sql: string, ...params: SQLInputValue[]): void {
  if (!changes(db.prepare(sql).run(...params))) throw new Error("Nie znaleziono transakcji");
}

export function updateComment(id: string, comment: string): string {
  const next = comment.trim().slice(0, 80);
  updateOne("UPDATE transactions SET comment = ? WHERE id = ?", next, id);
  return next;
}

export function setExcluded(id: string, excluded: boolean): void {
  updateOne("UPDATE transactions SET excluded = ? WHERE id = ?", excluded ? 1 : 0, id);
}

/**
 * Sets the category of one payment. Without `onlyThis` it also creates/updates a rule for the payee,
 * so all past and future payments from them follow.
 */
export function applyCategory(
  id: string,
  category: string,
  options: { onlyThis?: boolean } = {},
): { updated: number; pattern: string } {
  const target = category.trim() || DEFAULT_CATEGORY;
  ensureCategory(target);
  const tx = getTransaction(id);
  const pattern = options.onlyThis ? "" : merchantPattern(tx);
  if (pattern.length < 2) {
    db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(target, id);
    return { updated: 1, pattern: "" };
  }
  const { updated } = upsertRule(pattern, target);
  db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(target, id);
  return { updated: Math.max(updated, 1), pattern };
}

export function listUncategorized(ids?: string[]): Transaction[] {
  if (ids?.length) {
    return selectTransactions(`id IN (${ids.map(() => "?").join(",")}) AND ${UNCATEGORIZED}`, [...ids, DEFAULT_CATEGORY]);
  }
  return selectTransactions(UNCATEGORIZED, [DEFAULT_CATEGORY]);
}

function count(where: string, params: SQLInputValue[]): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE ${where}`).get(...params) as { n: number };
  return Number(row.n);
}

export function countTransactions(account?: string): number {
  const scoped = forAccount("1=1", [], account);
  return count(scoped.where, scoped.params);
}

export function countUncategorized(account?: string): number {
  const scoped = forAccount(UNCATEGORIZED, [DEFAULT_CATEGORY], account);
  return count(scoped.where, scoped.params);
}

export function countExcluded(account?: string): number {
  const scoped = forAccount("excluded = 1", [], account);
  return count(scoped.where, scoped.params);
}

export function dateBounds(account?: string): DateBounds {
  const scoped = forAccount("1=1", [], account);
  const row = db
    .prepare(`SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM transactions WHERE ${scoped.where}`)
    .get(...scoped.params) as { minDate: string | null; maxDate: string | null };
  return { minDate: row.minDate || "", maxDate: row.maxDate || "" };
}

export function deleteDemo(): void {
  db.exec("DELETE FROM transactions WHERE source = 'demo'");
}

export function clearTransactions(): void {
  db.exec("DELETE FROM transactions; DELETE FROM bank_accounts; DELETE FROM period_evaluations;");
}

export function clearAll(): void {
  clearTransactions();
  db.exec(
    "DELETE FROM accounts; DELETE FROM category_rules; DELETE FROM custom_categories; DELETE FROM hidden_categories; DELETE FROM category_limits;",
  );
}
