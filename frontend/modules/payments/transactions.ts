import { DEFAULT_CATEGORY, TX_SORTS, merchantPattern } from "../../../shared/domain";
import { parseIso } from "../../../shared/dates";
import { parseDecimal } from "../../../shared/numbers";
import type { Store } from "../../../shared/store";
import type { DateBounds, InsertResult, Transaction, TransactionsResult, TxFilters, TxQuery, TxSort } from "../../../shared/types";
import { ensureCategory, listCategories, matchesPattern, upsertRule } from "../categories/categories";

/** Filters as typed in the UI (amounts with a comma) plus the active account ("" = all). */
export function toFilters(query: TxQuery, account: string): TxFilters {
  return {
    ...query,
    category: query.category && query.category !== "Wszystkie" ? query.category : undefined,
    minAmount: parseDecimal(query.minAmount),
    maxAmount: parseDecimal(query.maxAmount),
    account: account || undefined,
    sort: query.sort && TX_SORTS.includes(query.sort) ? query.sort : "date_desc",
  };
}

export function ofAccount(items: Transaction[], account?: string): Transaction[] {
  return account ? items.filter((tx) => tx.accountId === account) : items;
}

/** Search box: payment texts and the user's comments. */
function searchText(tx: Transaction): string {
  return [tx.payee, tx.title, tx.description, tx.type, tx.comment].join("\n").toLowerCase();
}

export function filterTransactions(items: Transaction[], filters: TxFilters): Transaction[] {
  const categories = filters.category
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const q = filters.q?.toLowerCase();
  const { minAmount, maxAmount, weekday } = filters;
  return items.filter((tx) => {
    if (filters.account && tx.accountId !== filters.account) return false;
    if (filters.from && tx.date < filters.from) return false;
    if (filters.to && tx.date > filters.to) return false;
    if (categories?.length && !categories.includes(tx.category)) return false;
    if (q && !searchText(tx).includes(q)) return false;
    if (filters.kind === "expense" && tx.amount >= 0) return false;
    if (filters.kind === "income" && tx.amount <= 0) return false;
    if (filters.excludedOnly && !tx.excluded) return false;
    if (weekday != null && weekday >= 0 && weekday <= 6 && parseIso(tx.date).getDay() !== weekday) return false;
    if (minAmount != null && !Number.isNaN(minAmount) && Math.abs(tx.amount) < minAmount) return false;
    if (maxAmount != null && !Number.isNaN(maxAmount) && Math.abs(tx.amount) > maxAmount) return false;
    return true;
  });
}

const byDate = (a: Transaction, b: Transaction) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
const bySize = (a: Transaction, b: Transaction) => Math.abs(a.amount) - Math.abs(b.amount);
const byCategory = (a: Transaction, b: Transaction) => a.category.localeCompare(b.category, "pl");

const ORDER: Record<TxSort, (a: Transaction, b: Transaction) => number> = {
  date_desc: (a, b) => byDate(b, a),
  date_asc: byDate,
  amount_desc: (a, b) => bySize(b, a) || b.date.localeCompare(a.date),
  amount_asc: (a, b) => bySize(a, b) || b.date.localeCompare(a.date),
  category_asc: (a, b) => byCategory(a, b) || bySize(b, a) || b.date.localeCompare(a.date),
  category_desc: (a, b) => byCategory(b, a) || bySize(b, a) || b.date.localeCompare(a.date),
};

export function sortTransactions(items: Transaction[], sort: TxSort = "date_desc"): Transaction[] {
  return [...items].sort(ORDER[sort]);
}

export function dateBounds(items: Transaction[]): DateBounds {
  let minDate = "";
  let maxDate = "";
  for (const tx of items) {
    if (!minDate || tx.date < minDate) minDate = tx.date;
    if (!maxDate || tx.date > maxDate) maxDate = tx.date;
  }
  return { minDate, maxDate };
}

export function isUncategorized(tx: Transaction): boolean {
  return !tx.category || tx.category === DEFAULT_CATEGORY;
}

/** The payments list: filtered, sorted, at most `limit` rows. */
export function listTransactions(store: Store, filters: TxFilters, limit = 5000): TransactionsResult {
  const all = ofAccount(store.transactions, filters.account);
  const matched = filterTransactions(all, filters);
  return {
    items: sortTransactions(matched, filters.sort).slice(0, limit),
    matched: matched.length,
    categories: listCategories(store),
    total: all.length,
    ...dateBounds(all),
  };
}

function patchTransaction(draft: Store, id: string, fields: Partial<Transaction>): void {
  if (!draft.transactions.some((tx) => tx.id === id)) throw new Error("Nie znaleziono transakcji");
  draft.transactions = draft.transactions.map((tx) => (tx.id === id ? { ...tx, ...fields } : tx));
}

/** Returns the saved comment (trimmed, at most 80 characters). */
export function setComment(draft: Store, id: string, comment: string): string {
  const next = comment.trim().slice(0, 80);
  patchTransaction(draft, id, { comment: next });
  return next;
}

export function setExcluded(draft: Store, id: string, excluded: boolean): void {
  patchTransaction(draft, id, { excluded });
}

export type CategoryChangeResult = { updated: number; skippedManual: number; pattern: string };

/**
 * Sets the category of one payment. Without `onlyThis` it also creates/updates a rule for the payee, so all
 * past and future payments from them follow — except those marked `manualCategory`, unless `force`.
 */
export function applyCategory(
  draft: Store,
  id: string,
  category: string,
  options: { onlyThis?: boolean; force?: boolean; manual?: boolean } = {},
): CategoryChangeResult {
  const target = category.trim() || DEFAULT_CATEGORY;
  const tx = draft.transactions.find((row) => row.id === id);
  if (!tx) throw new Error("Nie znaleziono transakcji");
  ensureCategory(draft, target);
  if (options.onlyThis) {
    patchTransaction(draft, id, { category: target, manualCategory: options.manual !== false });
    return { updated: 1, skippedManual: 0, pattern: "" };
  }
  const pattern = merchantPattern(tx);
  if (pattern.length < 2) {
    patchTransaction(draft, id, { category: target, manualCategory: false });
    return { updated: 1, skippedManual: 0, pattern: "" };
  }
  const force = Boolean(options.force);
  const skippedManual = force
    ? 0
    : draft.transactions.filter((row) => row.manualCategory && row.id !== id && matchesPattern(row, pattern)).length;
  const { updated } = upsertRule(draft, pattern, target, { force });
  patchTransaction(draft, id, { category: target, manualCategory: false });
  return { updated: Math.max(updated, 1), skippedManual, pattern };
}

type NewTransaction = Pick<
  Transaction,
  "id" | "date" | "bookingDate" | "amount" | "type" | "payee" | "title" | "description" | "accountId" | "category" | "source" | "externalId"
> &
  Partial<Pick<Transaction, "currency" | "accountIban" | "createdAt">>;

/** Every new payment (CSV, bank, demo) is built here. */
export function newTransaction(input: NewTransaction): Transaction {
  return {
    ...input,
    currency: input.currency || "PLN",
    accountIban: input.accountIban || "",
    comment: "",
    excluded: false,
    manualCategory: false,
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

/** Today (UTC) shifted by `offsetDays`, as YYYY-MM-DD. */
export function utcDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Adds payments whose id is not there yet; `replaceCsvFor` first drops that account's CSV payments. */
export function insertTransactions(draft: Store, items: Transaction[], options: { replaceCsvFor?: string } = {}): InsertResult {
  const kept = options.replaceCsvFor
    ? draft.transactions.filter((tx) => !(tx.source === "csv" && tx.accountId === options.replaceCsvFor))
    : draft.transactions;
  const known = new Set(kept.map((tx) => tx.id));
  const fresh: Transaction[] = [];
  for (const item of items) {
    if (known.has(item.id)) continue;
    known.add(item.id);
    fresh.push(item);
  }
  draft.transactions = [...kept, ...fresh];
  const ids = fresh.map((tx) => tx.id);
  return { imported: ids.length, skipped: items.length - ids.length, ids };
}
