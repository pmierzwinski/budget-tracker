import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import type { TxFilters, TxSort } from "../shared/types.ts";
import { SqlWhere } from "../core/Repository.ts";

/** Search box: payment texts and the user's comments. */
const SEARCH_COLUMNS = ["payee", "title", "description", "type", "comment"];

const ORDER_BY: Record<TxSort, string> = {
  date_desc: "date DESC, created_at DESC",
  date_asc: "date ASC, created_at ASC",
  amount_desc: "ABS(amount) DESC, date DESC",
  amount_asc: "ABS(amount) ASC, date DESC",
  category_asc: "category COLLATE NOCASE ASC, ABS(amount) DESC, date DESC",
  category_desc: "category COLLATE NOCASE DESC, ABS(amount) DESC, date DESC",
};

/** Translates the API filters into SQL over the transactions table. */
export class TransactionFilter {
  static readonly UNCATEGORIZED = "(category = ? OR category = '' OR category IS NULL)";

  static uncategorized(account?: string): SqlWhere {
    return new SqlWhere(TransactionFilter.UNCATEGORIZED, DEFAULT_CATEGORY).forAccount(account);
  }

  static orderBy(sort: TxSort = "date_desc"): string {
    return ORDER_BY[sort];
  }

  static where(filters: TxFilters): SqlWhere {
    const where = new SqlWhere();
    if (filters.account) where.add("account_id = ?", filters.account);
    if (filters.from) where.add("date >= ?", filters.from);
    if (filters.to) where.add("date <= ?", filters.to);
    if (filters.category && filters.category !== "Wszystkie") {
      const names = filters.category
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length === 1) where.add("category = ?", names[0]);
      else if (names.length > 1) where.add(`category IN (${names.map(() => "?").join(",")})`, ...names);
    }
    if (filters.q) {
      where.add(
        `(${SEARCH_COLUMNS.map((column) => `${column} LIKE ?`).join(" OR ")})`,
        ...SEARCH_COLUMNS.map(() => `%${filters.q}%`),
      );
    }
    if (filters.kind === "expense") where.add("amount < 0");
    if (filters.kind === "income") where.add("amount > 0");
    if (filters.excludedOnly) where.add("excluded = 1");
    if (filters.weekday != null && filters.weekday >= 0 && filters.weekday <= 6) {
      where.add("CAST(strftime('%w', date) AS INTEGER) = ?", filters.weekday);
    }
    if (filters.minAmount != null && !Number.isNaN(filters.minAmount)) where.add("ABS(amount) >= ?", filters.minAmount);
    if (filters.maxAmount != null && !Number.isNaN(filters.maxAmount)) where.add("ABS(amount) <= ?", filters.maxAmount);
    return where;
  }
}
