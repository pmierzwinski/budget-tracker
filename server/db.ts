import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { appRoot, hosted } from "./runtime.ts";
import {
  BUILTIN_CATEGORIES,
  DEFAULT_CATEGORY,
  LEGACY_SKIP_CATEGORY,
  categorizeWithUserRules,
  searchText,
  suggestPattern,
} from "./categorize.ts";
import type {
  Account,
  AmountBucket,
  CategoryBudget,
  CategoryLimitSetting,
  CategoryRule,
  Insights,
  PeriodEvaluation,
  RecurringStatus,
  Stats,
  Transaction,
  TxFilters,
} from "./types.ts";

const dataDir = join(appRoot, "data");
const scope = new AsyncLocalStorage<DatabaseSync>();
let fileDb: DatabaseSync | null = null;

function currentDb(): DatabaseSync {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  if (hosted) throw new Error("Sesja wygasła — odśwież stronę.");
  if (!fileDb) {
    mkdirSync(dataDir, { recursive: true });
    fileDb = openDatabase(join(dataDir, "wydatki.db"));
  }
  return fileDb;
}

const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const target = currentDb();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export function openDatabase(path = ":memory:"): DatabaseSync {
  const database = new DatabaseSync(path);
  scope.run(database, initSchema);
  return database;
}

export function withDatabase<T>(database: DatabaseSync, fn: () => T): T {
  return scope.run(database, fn);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    booking_date TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'PLN',
    type TEXT,
    payee TEXT,
    title TEXT,
    description TEXT,
    account_iban TEXT,
    category TEXT,
    comment TEXT NOT NULL DEFAULT '',
    source TEXT,
    external_id TEXT UNIQUE,
    created_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    iban TEXT,
    name TEXT,
    currency TEXT,
    gocardless_account_id TEXT,
    requisition_id TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    bank TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    external_id TEXT NOT NULL DEFAULT '',
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS hidden_categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS period_evaluations (
    scope TEXT PRIMARY KEY,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    label TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS category_limits (
    category TEXT PRIMARY KEY,
    monthly_limit REAL NOT NULL
  );
`;

function migrateColumns(): void {
  const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!cols.some((col) => col.name === "comment")) {
    db.exec("ALTER TABLE transactions ADD COLUMN comment TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((col) => col.name === "excluded")) {
    db.exec("ALTER TABLE transactions ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.some((col) => col.name === "account_id")) {
    db.exec("ALTER TABLE transactions ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)");
}

function migrationDone(key: string): boolean {
  return Boolean(db.prepare("SELECT value FROM settings WHERE key = ?").get(key));
}

function migrateValueDate(): void {
  if (!migrationDone("migration.value_date")) {
    db.exec(`
      BEGIN;
      UPDATE transactions SET date = booking_date, booking_date = date
        WHERE booking_date IS NOT NULL AND booking_date <> '' AND booking_date <> date;
      INSERT INTO settings (key, value) VALUES ('migration.value_date', '1');
      COMMIT;
    `);
  }
}

function migrateSkipFlag(): void {
  if (!migrationDone("migration.skip_flag")) {
    const rules = listRules().filter((rule) => rule.category !== LEGACY_SKIP_CATEGORY);
    const blocked = new Set([...hiddenCategoryNames(), LEGACY_SKIP_CATEGORY]);
    const rows = db.prepare("SELECT * FROM transactions WHERE category = ?").all(LEGACY_SKIP_CATEGORY) as Record<
      string,
      unknown
    >[];
    const update = db.prepare("UPDATE transactions SET excluded = 1, category = ? WHERE id = ?");
    db.exec("BEGIN");
    try {
      for (const row of rows) {
        const tx = rowToTx(row);
        update.run(categorizeWithUserRules(searchText(tx), tx.amount, rules, blocked), tx.id);
      }
      db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(DEFAULT_CATEGORY, LEGACY_SKIP_CATEGORY);
      db.prepare("DELETE FROM category_limits WHERE category = ?").run(LEGACY_SKIP_CATEGORY);
      db.prepare("DELETE FROM custom_categories WHERE name = ?").run(LEGACY_SKIP_CATEGORY);
      db.prepare("INSERT INTO settings (key, value) VALUES ('migration.skip_flag', '1')").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function migrateAccounts(): void {
  if (!migrationDone("migration.accounts")) {
    const orphans = Number(
      (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ''").get() as { n: number }).n,
    );
    db.exec("BEGIN");
    try {
      if (orphans) {
        const id = randomUUID();
        db.prepare("INSERT INTO accounts (id, name, bank, created_at) VALUES (?, ?, ?, ?)").run(
          id,
          "PKO BP",
          "pko",
          new Date().toISOString(),
        );
        db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ''").run(id);
      }
      db.prepare("INSERT INTO settings (key, value) VALUES ('migration.accounts', '1')").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function initSchema(): void {
  db.exec(SCHEMA);
  migrateColumns();
  migrateValueDate();
  migrateSkipFlag();
  migrateAccounts();
}

function rowToTx(row: Record<string, unknown>): Transaction {
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
    source: (row.source as Transaction["source"]) || "csv",
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function insertTransactions(
  items: Transaction[],
  options: { replaceCsvFor?: string } = {},
): { imported: number; skipped: number; ids: string[] } {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
    (id, date, booking_date, amount, currency, type, payee, title, description, account_iban, account_id,
     category, comment, excluded, source, external_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  const ids: string[] = [];
  db.exec("BEGIN");
  try {
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
      const changes = Number(result.changes || 0);
      imported += changes;
      if (changes) ids.push(item.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { imported, skipped: items.length - imported, ids };
}

function filterClause(filters: TxFilters): { where: string; params: (string | number)[] } {
  const where: string[] = ["1=1"];
  const params: (string | number)[] = [];
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
    where.push("(payee LIKE ? OR title LIKE ? OR description LIKE ? OR type LIKE ? OR comment LIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like, like, like);
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

const SORTS: Record<NonNullable<TxFilters["sort"]>, string> = {
  date_desc: "date DESC, created_at DESC",
  date_asc: "date ASC, created_at ASC",
  amount_desc: "ABS(amount) DESC, date DESC",
  amount_asc: "ABS(amount) ASC, date DESC",
  category_asc: "category COLLATE NOCASE ASC, ABS(amount) DESC, date DESC",
  category_desc: "category COLLATE NOCASE DESC, ABS(amount) DESC, date DESC",
};

export function listTransactions(filters: TxFilters): { items: Transaction[]; matched: number } {
  const { where, params } = filterClause(filters);
  const matched = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE ${where}`).get(...params) as { n: number }).n,
  );
  const order = SORTS[filters.sort || "date_desc"];
  const limit = filters.limit ?? 5000;
  const rows = db
    .prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY ${order} LIMIT ?`)
    .all(...params, limit) as Record<string, unknown>[];
  return { items: rows.map(rowToTx), matched };
}

export function updateComment(id: string, comment: string): string {
  const next = comment.trim().slice(0, 80);
  const result = db.prepare("UPDATE transactions SET comment = ? WHERE id = ?").run(next, id);
  if (!Number(result.changes || 0)) throw new Error("Nie znaleziono transakcji");
  return next;
}

export function setExcluded(id: string, excluded: boolean): void {
  const result = db.prepare("UPDATE transactions SET excluded = ? WHERE id = ?").run(excluded ? 1 : 0, id);
  if (!Number(result.changes || 0)) throw new Error("Nie znaleziono transakcji");
}

export function applyCategory(
  id: string,
  category: string,
  options: { onlyThis?: boolean } = {},
): { updated: number; pattern: string } {
  const trimmed = category.trim() || DEFAULT_CATEGORY;
  ensureCategory(trimmed);
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Nie znaleziono transakcji");
  const tx = rowToTx(row);

  if (options.onlyThis) {
    db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(trimmed, id);
    return { updated: 1, pattern: "" };
  }

  const pattern = suggestPattern(tx.payee || tx.title || tx.type);
  if (pattern.length < 2) {
    db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(trimmed, id);
    return { updated: 1, pattern: "" };
  }

  const { updated } = upsertRule(pattern, trimmed);
  db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(trimmed, id);
  return { updated: Math.max(updated, 1), pattern };
}

const DEFAULT_THRESHOLDS = [100, 200, 300, 500];

export function amountThresholds(): number[] {
  const raw = getSetting("amount_buckets");
  if (!raw) return DEFAULT_THRESHOLDS;
  const values = raw
    .split(",")
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? [...new Set(values)].sort((a, b) => a - b) : DEFAULT_THRESHOLDS;
}

export function setAmountThresholds(values: number[]): number[] {
  const clean = [...new Set(values.map((value) => Math.round(value * 100) / 100))]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!clean.length) throw new Error("Podaj co najmniej jeden próg kwoty.");
  if (clean.length > 9) throw new Error("Maksymalnie 9 progów — wykres robi się nieczytelny.");
  setSetting("amount_buckets", clean.join(","));
  return clean;
}

const RECURRING_STATUSES: RecurringStatus[] = ["auto", "active", "ended", "hidden"];

function getRecurringOverrides(): Record<string, RecurringStatus> {
  try {
    const parsed = JSON.parse(getSetting("recurring_overrides") || "{}") as Record<string, string>;
    const clean: Record<string, RecurringStatus> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (RECURRING_STATUSES.includes(value as RecurringStatus) && value !== "auto") clean[key] = value as RecurringStatus;
    }
    return clean;
  } catch {
    return {};
  }
}

const RECURRING_ORDER: Record<RecurringStatus, number> = { auto: 0, active: 1, ended: 2, hidden: 3 };

function compareRecurring(a: Insights["recurring"][number], b: Insights["recurring"][number]): number {
  return (
    RECURRING_ORDER[a.status] - RECURRING_ORDER[b.status] ||
    Number(b.active) - Number(a.active) ||
    b.amount - a.amount
  );
}

export function setRecurringStatus(key: string, status: RecurringStatus): void {
  const clean = key.trim().toLowerCase();
  if (!clean) throw new Error("Brak nazwy płatności cyklicznej.");
  if (!RECURRING_STATUSES.includes(status)) throw new Error("Nieznany status płatności cyklicznej.");
  const overrides = getRecurringOverrides();
  if (status === "auto") delete overrides[clean];
  else overrides[clean] = status;
  setSetting("recurring_overrides", JSON.stringify(overrides));
}

function formatZl(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function amountBuckets(): Omit<AmountBucket, "amount" | "count">[] {
  const thresholds = amountThresholds();
  const buckets: Omit<AmountBucket, "amount" | "count">[] = [];
  let min = 0;
  for (const max of thresholds) {
    buckets.push({
      id: `${min}-${max}`,
      label: min === 0 ? `<${formatZl(max)} zł` : `${formatZl(min)}–${formatZl(max)} zł`,
      min,
      max,
    });
    min = max;
  }
  buckets.push({ id: `${min}-`, label: `>${formatZl(min)} zł`, min, max: null });
  return buckets;
}

function scrubHiddenCategories(): void {
  db.prepare(
    `UPDATE transactions SET category = ?
     WHERE category IN (SELECT name FROM hidden_categories)`,
  ).run(DEFAULT_CATEGORY);
}

export function getStats(filters: TxFilters): Stats {
  scrubHiddenCategories();
  const { where, params } = filterClause(filters);
  const rows = db
    .prepare(`SELECT amount, category, date, excluded FROM transactions WHERE ${where}`)
    .all(...params) as { amount: number; category: string; date: string; excluded: number }[];

  let income = 0;
  let expenses = 0;
  let excludedCount = 0;
  let excludedSpend = 0;
  const catMap = new Map<string, number>();
  const monthCat = new Map<string, number>();
  const dayCat = new Map<string, number>();
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];
  const buckets = amountBuckets().map((bucket) => ({ ...bucket, amount: 0, count: 0 }));
  for (const row of rows) {
    const category = row.category || DEFAULT_CATEGORY;
    if (row.excluded) {
      excludedCount += 1;
      if (row.amount < 0) excludedSpend += -row.amount;
      if (!filters.includeExcluded) continue;
    }
    catMap.set(category, (catMap.get(category) || 0) + row.amount);
    const monthKey = `${row.date.slice(0, 7)}|${category}`;
    monthCat.set(monthKey, (monthCat.get(monthKey) || 0) + row.amount);
    const dayKey = `${row.date.slice(0, 10)}|${category}`;
    dayCat.set(dayKey, (dayCat.get(dayKey) || 0) + row.amount);
    if (row.amount >= 0) income += row.amount;
    else {
      const spent = -row.amount;
      expenses += spent;
      const bucket = buckets.find((item) => spent >= item.min && (item.max == null || spent < item.max));
      if (bucket) {
        bucket.amount += spent;
        bucket.count += 1;
      }
      const [year, month, day] = row.date.split("-").map(Number);
      if (year && month && day) {
        weekdaySpend[new Date(year, month - 1, day).getDay()] += spent;
      }
    }
  }

  const byMonthRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE ${where}
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`,
    )
    .all(...params) as { month: string; income: number; expenses: number }[];

  const splitKey = <K extends string>(map: Map<string, number>, name: K) =>
    [...map.entries()]
      .filter(([, net]) => Math.abs(net) > 0.004)
      .map(([key, net]) => {
        const [bucket, category] = key.split("|");
        return { [name]: bucket, category, amount: -net } as Record<K, string> & { category: string; amount: number };
      })
      .sort((a, b) => (a[name] < b[name] ? -1 : a[name] > b[name] ? 1 : 0));

  const bounds = dateBounds(filters.account);
  const from = filters.from || bounds.minDate || "";
  const to = filters.to || bounds.maxDate || "";
  const factor = periodMonthFactor(from, to);
  return {
    from,
    to,
    income,
    expenses,
    net: income - expenses,
    byCategory: [...catMap.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => a.amount - b.amount),
    byMonth: byMonthRows,
    byMonthCategory: splitKey(monthCat, "month"),
    byDayCategory: splitKey(dayCat, "date"),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((jsDay) => ({
      id: jsDay,
      amount: weekdaySpend[jsDay],
    })),
    byAmount: buckets,
    count: rows.length,
    totalAll: countTransactions(filters.account),
    excludedCount,
    excludedSpend,
    limitMonths: factor,
    limits: buildCategoryBudgets(catMap, factor, hiddenCategoryNames()),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

export function getInsights(filters: TxFilters): Insights {
  const base: TxFilters = { from: filters.from, to: filters.to, account: filters.account, kind: "expense" };
  const { where, params } = filterClause(base);
  const excludedSql = filters.includeExcluded ? "" : " AND excluded = 0";
  const rows = (
    db.prepare(`SELECT * FROM transactions WHERE ${where}${excludedSql}`).all(...params) as Record<string, unknown>[]
  ).map(rowToTx);

  const groups = new Map<string, Transaction[]>();
  for (const tx of rows) {
    const key = (tx.payee || tx.title || tx.type || "Operacja").replace(/\s+/g, " ").trim().toLowerCase();
    groups.set(key, [...(groups.get(key) || []), tx]);
  }
  const payees = [...groups.values()]
    .map((items) => {
      const amount = items.reduce((sum, tx) => sum - tx.amount, 0);
      return {
        name: mostCommon(items.map((tx) => (tx.payee || tx.title || tx.type || "Operacja").replace(/\s+/g, " ").trim())),
        category: mostCommon(items.map((tx) => tx.category)),
        amount,
        count: items.length,
        average: amount / items.length,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const biggest = [...rows].sort((a, b) => a.amount - b.amount).slice(0, 8);

  const bounds = dateBounds(filters.account);
  const from = filters.from || bounds.minDate;
  const lastData = [bounds.maxDate, isoDay(new Date())].filter(Boolean).sort().pop() || "";
  const to = [filters.to || bounds.maxDate, lastData].filter(Boolean).sort()[0] || "";
  const spendByDay = new Map<string, number>();
  for (const tx of rows) spendByDay.set(tx.date, (spendByDay.get(tx.date) || 0) - tx.amount);
  const daily: number[] = [];
  let weekdaySum = 0;
  let weekdayDays = 0;
  let weekendSum = 0;
  let weekendDays = 0;
  let maxDay: Insights["daily"]["maxDay"] = null;
  if (from && to && from <= to) {
    const cursor = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
    for (let guard = 0; guard < 4000; guard += 1) {
      const iso = isoDay(cursor);
      if (iso > to) break;
      const spent = spendByDay.get(iso) || 0;
      daily.push(spent);
      const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
      if (weekend) {
        weekendSum += spent;
        weekendDays += 1;
      } else {
        weekdaySum += spent;
        weekdayDays += 1;
      }
      if (spent > 0 && (!maxDay || spent > maxDay.amount)) maxDay = { date: iso, amount: spent };
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const total = daily.reduce((sum, value) => sum + value, 0);
  const spendDays = daily.filter((value) => value > 0.004).length;

  const history = (
    db
      .prepare(
        `SELECT * FROM transactions WHERE amount < 0 AND excluded = 0${filters.account ? " AND account_id = ?" : ""}`,
      )
      .all(...(filters.account ? [filters.account] : [])) as Record<string, unknown>[]
  ).map(rowToTx);
  const byMerchant = new Map<string, Transaction[]>();
  for (const tx of history) {
    const key = suggestPattern(tx.payee || tx.title || tx.type).toLowerCase();
    if (key.length < 2) continue;
    byMerchant.set(key, [...(byMerchant.get(key) || []), tx]);
  }
  const recurring: Insights["recurring"] = [];
  const activeSince = bounds.maxDate ? monthIndex(bounds.maxDate) - 1 : 0;
  const overrides = getRecurringOverrides();
  for (const [key, items] of byMerchant) {
    const months = new Set(items.map((tx) => tx.date.slice(0, 7)));
    if (months.size < 3) continue;
    const sortedMonths = [...months].sort();
    const span = monthIndex(sortedMonths[sortedMonths.length - 1]) - monthIndex(sortedMonths[0]) + 1;
    if (months.size / span < 0.7 || items.length / months.size > 1.6) continue;
    const amounts = items.map((tx) => -tx.amount);
    const typical = median(amounts);
    const steady = amounts.filter((value) => Math.abs(value - typical) <= Math.max(typical * 0.2, 2)).length;
    if (steady / amounts.length < 0.7) continue;
    const lastDate = items.map((tx) => tx.date).sort().pop() || "";
    const autoActive = monthIndex(lastDate) >= activeSince;
    const status = overrides[key] || "auto";
    recurring.push({
      key,
      name: mostCommon(items.map((tx) => (tx.payee || tx.title || tx.type).replace(/\s+/g, " ").trim())),
      category: mostCommon(items.map((tx) => tx.category)),
      amount: typical,
      months: months.size,
      lastDate,
      active: status === "auto" ? autoActive : status === "active",
      autoActive,
      status,
    });
  }
  recurring.sort(compareRecurring);

  return {
    payees,
    biggest,
    recurring: recurring.slice(0, 40),
    daily: {
      days: daily.length,
      average: daily.length ? total / daily.length : 0,
      median: median(daily),
      spendDays,
      noSpendDays: daily.length - spendDays,
      weekdayAverage: weekdayDays ? weekdaySum / weekdayDays : 0,
      weekendAverage: weekendDays ? weekendSum / weekendDays : 0,
      maxDay,
    },
  };
}

export function dateBounds(account?: string): { minDate: string; maxDate: string } {
  const row = (
    account
      ? db.prepare("SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM transactions WHERE account_id = ?").get(account)
      : db.prepare("SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM transactions").get()
  ) as { minDate: string | null; maxDate: string | null };
  return { minDate: row.minDate || "", maxDate: row.maxDate || "" };
}

export function hiddenCategoryNames(): Set<string> {
  return new Set(
    (db.prepare("SELECT name FROM hidden_categories").all() as { name: string }[]).map((row) => row.name),
  );
}

export function listCategories(): string[] {
  const custom = db.prepare("SELECT name FROM custom_categories ORDER BY name").all() as { name: string }[];
  const used = db.prepare("SELECT DISTINCT category FROM transactions").all() as { category: string }[];
  const hidden = hiddenCategoryNames();
  const names = [
    ...new Set([...BUILTIN_CATEGORIES, ...custom.map((row) => row.name), ...used.map((row) => row.category)]),
  ].filter((name) => name && name !== DEFAULT_CATEGORY && !hidden.has(name));
  names.sort((a, b) => a.localeCompare(b, "pl"));
  return [...names, DEFAULT_CATEGORY];
}

export function ensureCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  db.prepare("DELETE FROM hidden_categories WHERE name = ?").run(trimmed);
  if ((BUILTIN_CATEGORIES as readonly string[]).includes(trimmed)) return;
  db.prepare("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)").run(trimmed);
}

export function addCustomCategory(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Podaj nazwę kategorii");
  if (trimmed.length > 40) throw new Error("Nazwa może mieć najwyżej 40 znaków.");
  ensureCategory(trimmed);
  return trimmed;
}

export function renameCategory(from: string, to: string): { categories: string[]; updated: number } {
  const source = from.trim();
  const target = to.trim();
  if (!source || !target) throw new Error("Podaj obecną i nową nazwę.");
  if (source === DEFAULT_CATEGORY) {
    throw new Error("Kategorii „Inne” nie można zmienić — to domyślna dla nieskategoryzowanych.");
  }
  if (source === target) return { categories: listCategories(), updated: 0 };

  db.exec("BEGIN");
  try {
    ensureCategory(target);
    const updated = Number(
      db.prepare("UPDATE transactions SET category = ? WHERE category = ?").run(target, source).changes || 0,
    );
    db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(target, source);
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(target);
    db.prepare("UPDATE category_limits SET category = ? WHERE category = ?").run(target, source);
    db.prepare("DELETE FROM custom_categories WHERE name = ?").run(source);
    if ((BUILTIN_CATEGORIES as readonly string[]).includes(source)) {
      db.prepare("INSERT OR IGNORE INTO hidden_categories (name) VALUES (?)").run(source);
    }
    db.prepare("DELETE FROM hidden_categories WHERE name = ?").run(target);
    db.exec("COMMIT");
    return { categories: listCategories(), updated };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteCategory(name: string): { categories: string[]; updated: number } {
  const source = name.trim();
  if (!source) throw new Error("Podaj kategorię");
  if (source === DEFAULT_CATEGORY) {
    throw new Error("Kategorii „Inne” nie można usunąć — to miejsce na nieskategoryzowane płatności.");
  }

  db.exec("BEGIN");
  try {
    const updated = Number(
      db.prepare("UPDATE transactions SET category = ? WHERE category = ?").run(DEFAULT_CATEGORY, source).changes || 0,
    );
    db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(DEFAULT_CATEGORY, source);
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(source);
    db.prepare("DELETE FROM custom_categories WHERE name = ?").run(source);
    if ((BUILTIN_CATEGORIES as readonly string[]).includes(source)) {
      db.prepare("INSERT OR IGNORE INTO hidden_categories (name) VALUES (?)").run(source);
    }
    db.exec("COMMIT");
    return { categories: listCategories(), updated };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listUncategorized(ids?: string[]): Transaction[] {
  if (ids?.length) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM transactions
         WHERE id IN (${placeholders})
           AND (category = ? OR category = '' OR category IS NULL)`,
      )
      .all(...ids, DEFAULT_CATEGORY) as Record<string, unknown>[];
    return rows.map(rowToTx);
  }
  const rows = db
    .prepare("SELECT * FROM transactions WHERE category = ? OR category = '' OR category IS NULL")
    .all(DEFAULT_CATEGORY) as Record<string, unknown>[];
  return rows.map(rowToTx);
}

export function countUncategorized(account?: string): number {
  const sql = "SELECT COUNT(*) AS n FROM transactions WHERE (category = ? OR category = '' OR category IS NULL)";
  const row = (
    account
      ? db.prepare(`${sql} AND account_id = ?`).get(DEFAULT_CATEGORY, account)
      : db.prepare(sql).get(DEFAULT_CATEGORY)
  ) as { n: number };
  return Number(row.n);
}

export function countExcluded(account?: string): number {
  const sql = "SELECT COUNT(*) AS n FROM transactions WHERE excluded = 1";
  const row = (account ? db.prepare(`${sql} AND account_id = ?`).get(account) : db.prepare(sql).get()) as { n: number };
  return Number(row.n);
}

export function listRules(): CategoryRule[] {
  return (
    db.prepare("SELECT id, pattern, category, created_at FROM category_rules ORDER BY created_at DESC").all() as {
      id: string;
      pattern: string;
      category: string;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    pattern: row.pattern,
    category: row.category,
    createdAt: row.created_at,
  }));
}

export function addRule(pattern: string, category: string): { rule: CategoryRule; updated: number } {
  return upsertRule(pattern, category);
}

export function upsertRule(pattern: string, category: string): { rule: CategoryRule; updated: number } {
  const trimmed = pattern.trim();
  if (trimmed.length < 2) throw new Error("Fraza musi mieć co najmniej 2 znaki.");
  const target = category.trim() || DEFAULT_CATEGORY;
  ensureCategory(target);
  const existing = db.prepare("SELECT id, pattern, category, created_at FROM category_rules WHERE LOWER(pattern) = LOWER(?)").get(
    trimmed,
  ) as { id: string; pattern: string; category: string; created_at: string } | undefined;

  if (existing) {
    db.prepare("UPDATE category_rules SET category = ? WHERE id = ?").run(target, existing.id);
    const rule: CategoryRule = {
      id: existing.id,
      pattern: existing.pattern,
      category: target,
      createdAt: existing.created_at,
    };
    return { rule, updated: applyRule(rule.pattern, rule.category) };
  }

  const rule: CategoryRule = {
    id: randomUUID(),
    pattern: trimmed,
    category: target,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO category_rules (id, pattern, category, created_at) VALUES (?, ?, ?, ?)").run(
    rule.id,
    rule.pattern,
    rule.category,
    rule.createdAt,
  );
  return { rule, updated: applyRule(rule.pattern, rule.category) };
}

export function deleteRule(id: string): void {
  db.prepare("DELETE FROM category_rules WHERE id = ?").run(id);
}

export function applyRule(pattern: string, category: string): number {
  const like = `%${pattern}%`;
  const result = db
    .prepare(
      `UPDATE transactions
       SET category = ?
       WHERE payee LIKE ? OR title LIKE ? OR description LIKE ? OR type LIKE ?`,
    )
    .run(category, like, like, like, like);
  return Number(result.changes || 0);
}

export function recategorizeAll(): number {
  const rules = listRules();
  const blocked = hiddenCategoryNames();
  const rows = db.prepare("SELECT * FROM transactions").all() as Record<string, unknown>[];
  const update = db.prepare("UPDATE transactions SET category = ? WHERE id = ?");
  let changed = 0;
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const tx = rowToTx(row);
      const next = categorizeWithUserRules(searchText(tx), tx.amount, rules, blocked);
      if (next !== tx.category) {
        update.run(next, tx.id);
        changed += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  scrubHiddenCategories();
  return changed;
}

export function getSetting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

function rowToAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    bank: String(row.bank ?? ""),
    iban: String(row.iban ?? ""),
    provider: (String(row.provider ?? "") as Account["provider"]) || "",
    count: Number(row.count || 0),
    minDate: String(row.min_date ?? ""),
    maxDate: String(row.max_date ?? ""),
  };
}

export function listAccounts(): Account[] {
  const rows = db
    .prepare(
      `SELECT a.*, COUNT(t.id) AS count, MIN(t.date) AS min_date, MAX(t.date) AS max_date
       FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
       GROUP BY a.id
       ORDER BY a.created_at ASC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToAccount);
}

export function getAccount(id: string): Account | null {
  return listAccounts().find((account) => account.id === id) || null;
}

function normalizeIban(iban: string): string {
  return iban.replace(/[\s']/g, "").toUpperCase();
}

export function createAccount(input: {
  name: string;
  bank: string;
  iban?: string;
  provider?: Account["provider"];
  externalId?: string;
}): Account {
  const name = input.name.trim();
  if (!name) throw new Error("Podaj nazwę konta.");
  if (name.length > 60) throw new Error("Nazwa konta może mieć najwyżej 60 znaków.");
  const id = randomUUID();
  db.prepare(
    "INSERT INTO accounts (id, name, bank, iban, provider, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    name,
    input.bank.trim(),
    normalizeIban(input.iban || ""),
    input.provider || "",
    input.externalId || "",
    new Date().toISOString(),
  );
  return getAccount(id)!;
}

export function updateAccount(id: string, patch: { name?: string; iban?: string }): Account {
  const account = getAccount(id);
  if (!account) throw new Error("Nie znaleziono konta.");
  const name = patch.name != null ? patch.name.trim() : account.name;
  if (!name) throw new Error("Podaj nazwę konta.");
  const iban = patch.iban != null ? normalizeIban(patch.iban) : account.iban;
  db.prepare("UPDATE accounts SET name = ?, iban = ? WHERE id = ?").run(name.slice(0, 60), iban, id);
  return getAccount(id)!;
}

export function deleteAccount(id: string): number {
  db.exec("BEGIN");
  try {
    const removed = Number(db.prepare("DELETE FROM transactions WHERE account_id = ?").run(id).changes || 0);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    db.exec("COMMIT");
    return removed;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function findAccount(input: {
  iban?: string;
  bank?: string;
  provider?: Account["provider"];
  externalId?: string;
}): Account | null {
  const accounts = listAccounts();
  const iban = normalizeIban(input.iban || "");
  if (input.provider && input.externalId) {
    const linked = accounts.find((row) => row.provider === input.provider && getExternalId(row.id) === input.externalId);
    if (linked) return linked;
  }
  if (iban) {
    const byIban = accounts.find((row) => row.iban && row.iban.slice(-26) === iban.slice(-26));
    if (byIban) return byIban;
  }
  if (input.bank) {
    const sameBank = accounts.filter((row) => row.bank === input.bank && (!iban || !row.iban));
    if (sameBank.length === 1) return sameBank[0];
  }
  return null;
}

function getExternalId(id: string): string {
  const row = db.prepare("SELECT external_id FROM accounts WHERE id = ?").get(id) as { external_id: string } | undefined;
  return row?.external_id || "";
}

export function linkAccount(id: string, input: { provider: Account["provider"]; externalId: string; iban?: string }): void {
  db.prepare(
    "UPDATE accounts SET provider = ?, external_id = ?, iban = CASE WHEN ? <> '' THEN ? ELSE iban END WHERE id = ?",
  ).run(input.provider, input.externalId, normalizeIban(input.iban || ""), normalizeIban(input.iban || ""), id);
}

export function linkedAccounts(provider: Account["provider"]): (Account & { externalId: string })[] {
  return listAccounts()
    .filter((row) => row.provider === provider)
    .map((row) => ({ ...row, externalId: getExternalId(row.id) }));
}

export function countTransactions(account?: string): number {
  const row = (
    account
      ? db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?").get(account)
      : db.prepare("SELECT COUNT(*) AS n FROM transactions").get()
  ) as { n: number };
  return Number(row.n);
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

function rowToEvaluation(row: Record<string, unknown>): PeriodEvaluation {
  return {
    scope: String(row.scope),
    from: String(row.from_date ?? ""),
    to: String(row.to_date ?? ""),
    label: String(row.label ?? ""),
    text: String(row.text ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function listPeriodEvaluations(): PeriodEvaluation[] {
  const rows = db
    .prepare("SELECT * FROM period_evaluations ORDER BY scope ASC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToEvaluation);
}

export function upsertPeriodEvaluation(item: PeriodEvaluation): PeriodEvaluation {
  db.prepare(
    `INSERT INTO period_evaluations (scope, from_date, to_date, label, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       from_date = excluded.from_date,
       to_date = excluded.to_date,
       label = excluded.label,
       text = excluded.text,
       created_at = excluded.created_at`,
  ).run(item.scope, item.from, item.to, item.label, item.text, item.createdAt);
  return item;
}

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, (month || 1) - 1, day || 1) / 86400000);
}

export function periodMonthFactor(from: string, to: string): number {
  if (!from || !to || from > to) return 1;
  let factor = 0;
  let cursor = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (cursor <= last) {
    const [year, month] = cursor.split("-").map(Number);
    const monthStart = `${cursor}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${cursor}-${String(lastDay).padStart(2, "0")}`;
    const overlapStart = from > monthStart ? from : monthStart;
    const overlapEnd = to < monthEnd ? to : monthEnd;
    if (overlapStart <= overlapEnd) {
      factor += (dayNumber(overlapEnd) - dayNumber(overlapStart) + 1) / lastDay;
    }
    const next = new Date(year, month, 1);
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  }
  return Math.max(Math.round(factor * 1000) / 1000, 0.01);
}

export function listCategoryLimits(): CategoryLimitSetting[] {
  const rows = db.prepare("SELECT category, monthly_limit FROM category_limits ORDER BY category").all() as {
    category: string;
    monthly_limit: number;
  }[];
  return rows
    .filter((row) => row.monthly_limit > 0)
    .map((row) => ({ category: row.category, monthlyLimit: Number(row.monthly_limit) }));
}

export function setCategoryLimit(category: string, monthlyLimit: number | null): CategoryLimitSetting[] {
  const name = category.trim();
  if (!name) throw new Error("Podaj kategorię");
  if (monthlyLimit == null || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(name);
    return listCategoryLimits();
  }
  const value = Math.round(monthlyLimit * 100) / 100;
  db.prepare(
    `INSERT INTO category_limits (category, monthly_limit) VALUES (?, ?)
     ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
  ).run(name, value);
  return listCategoryLimits();
}

function buildCategoryBudgets(
  catMap: Map<string, number>,
  factor: number,
  hidden: Set<string>,
): CategoryBudget[] {
  const budgets: CategoryBudget[] = [];
  for (const row of listCategoryLimits()) {
    if (hidden.has(row.category)) continue;
    const net = catMap.get(row.category) || 0;
    const spent = net < 0 ? -net : 0;
    const allowed = Math.round(row.monthlyLimit * factor * 100) / 100;
    const ratio = allowed > 0 ? spent / allowed : 0;
    const status: CategoryBudget["status"] = ratio > 1.001 ? "over" : ratio >= 0.85 ? "warn" : "ok";
    budgets.push({
      category: row.category,
      monthlyLimit: row.monthlyLimit,
      allowed,
      spent: Math.round(spent * 100) / 100,
      remaining: Math.round((allowed - spent) * 100) / 100,
      ratio: Math.round(ratio * 1000) / 1000,
      status,
    });
  }
  return budgets.sort((a, b) => {
    const rank = { over: 0, warn: 1, ok: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return b.ratio - a.ratio;
  });
}
