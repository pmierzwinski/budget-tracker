import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  BUILTIN_CATEGORIES,
  DEFAULT_CATEGORY,
  SKIP_STATS_CATEGORY,
  categorizeWithUserRules,
  searchText,
  suggestPattern,
} from "./categorize.ts";
import type { CategoryBudget, CategoryLimitSetting, CategoryRule, PeriodEvaluation, Stats, Transaction, TxFilters } from "./types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, "wydatki.db"));

db.exec(`
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
`);

{
  const cols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!cols.some((col) => col.name === "comment")) {
    db.exec("ALTER TABLE transactions ADD COLUMN comment TEXT NOT NULL DEFAULT ''");
  }
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
    category: String(row.category || DEFAULT_CATEGORY),
    comment: String(row.comment ?? ""),
    source: (row.source as Transaction["source"]) || "csv",
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function insertTransactions(
  items: Transaction[],
  options: { replaceCsv?: boolean } = {},
): { imported: number; skipped: number; ids: string[] } {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
    (id, date, booking_date, amount, currency, type, payee, title, description, account_iban, category, comment, source, external_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  const ids: string[] = [];
  db.exec("BEGIN");
  try {
    if (options.replaceCsv) {
      db.exec("DELETE FROM transactions WHERE source = 'csv'");
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
        item.category,
        item.comment || "",
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

export function updateCategory(id: string, category: string): void {
  applyCategory(id, category, { onlyThis: true });
}

export function updateComment(id: string, comment: string): string {
  const next = comment.trim().slice(0, 80);
  const result = db.prepare("UPDATE transactions SET comment = ? WHERE id = ?").run(next, id);
  if (!Number(result.changes || 0)) throw new Error("Nie znaleziono transakcji");
  return next;
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

const AMOUNT_BUCKETS = [
  { id: "gt500", label: ">500 zł", min: 500, max: Number.POSITIVE_INFINITY },
  { id: "300-500", label: "300–500 zł", min: 300, max: 500 },
  { id: "100-300", label: "100–300 zł", min: 100, max: 300 },
  { id: "lt100", label: "<100 zł", min: 0, max: 100 },
] as const;

function amountBucket(spent: number): string {
  if (spent >= 500) return "gt500";
  if (spent >= 300) return "300-500";
  if (spent >= 100) return "100-300";
  return "lt100";
}

function scrubHiddenCategories(): void {
  db.prepare(
    `UPDATE transactions SET category = ?
     WHERE category IN (SELECT name FROM hidden_categories)`,
  ).run(DEFAULT_CATEGORY);
}

export function getStats(filters: TxFilters): Stats {
  scrubHiddenCategories();
  const hidden = hiddenCategoryNames();
  const { where, params } = filterClause(filters);
  const monthRows = db
    .prepare(`SELECT amount, category, date FROM transactions WHERE ${where}`)
    .all(...params) as { amount: number; category: string; date: string }[];

  let income = 0;
  let expenses = 0;
  const catMap = new Map<string, number>();
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];
  const amountMap = new Map<string, { amount: number; count: number }>(
    AMOUNT_BUCKETS.map((bucket) => [bucket.id, { amount: 0, count: 0 }]),
  );
  for (const row of monthRows) {
    const category = row.category || DEFAULT_CATEGORY;
    if (category === SKIP_STATS_CATEGORY || hidden.has(category)) continue;
    catMap.set(category, (catMap.get(category) || 0) + row.amount);
    if (row.amount >= 0) income += row.amount;
    else {
      const spent = -row.amount;
      expenses += spent;
      const bucket = amountBucket(spent);
      const current = amountMap.get(bucket);
      if (current) {
        current.amount += spent;
        current.count += 1;
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

  const hiddenList = [...hidden];
  const hiddenSql = hiddenList.length
    ? `AND COALESCE(NULLIF(category, ''), 'Inne') NOT IN (${hiddenList.map(() => "?").join(",")})`
    : "";
  const byMonthCategoryRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              COALESCE(NULLIF(category, ''), 'Inne') AS category,
              SUM(amount) AS net
       FROM transactions
       WHERE ${where}
         AND COALESCE(NULLIF(category, ''), 'Inne') != ?
         ${hiddenSql}
       GROUP BY substr(date, 1, 7), COALESCE(NULLIF(category, ''), 'Inne')
       HAVING ABS(net) > 0.004
       ORDER BY month ASC`,
    )
    .all(...params, SKIP_STATS_CATEGORY, ...hiddenList) as {
    month: string;
    category: string;
    net: number;
  }[];

  const bounds = dateBounds();
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
    byMonthCategory: byMonthCategoryRows.map((row) => ({
      month: row.month,
      category: row.category,
      amount: -row.net,
    })),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((jsDay) => ({
      id: jsDay,
      amount: weekdaySpend[jsDay],
    })),
    byAmount: AMOUNT_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      amount: amountMap.get(bucket.id)?.amount || 0,
      count: amountMap.get(bucket.id)?.count || 0,
    })),
    count: monthRows.length,
    totalAll: countTransactions(),
    limitMonths: factor,
    limits: buildCategoryBudgets(catMap, factor, hidden),
  };
}

export function dateBounds(): { minDate: string; maxDate: string } {
  const row = db.prepare("SELECT MIN(date) AS minDate, MAX(date) AS maxDate FROM transactions").get() as {
    minDate: string | null;
    maxDate: string | null;
  };
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

export function countUncategorized(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE category = ? OR category = '' OR category IS NULL")
    .get(DEFAULT_CATEGORY) as { n: number };
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

export function saveBankAccount(account: {
  id: string;
  iban: string;
  name: string;
  currency: string;
  gocardlessAccountId: string;
  requisitionId: string;
}): void {
  db.prepare(
    `INSERT INTO bank_accounts (id, iban, name, currency, gocardless_account_id, requisition_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       iban = excluded.iban,
       name = excluded.name,
       currency = excluded.currency,
       gocardless_account_id = excluded.gocardless_account_id,
       requisition_id = excluded.requisition_id`,
  ).run(
    account.id,
    account.iban,
    account.name,
    account.currency,
    account.gocardlessAccountId,
    account.requisitionId,
  );
}

export function listBankAccounts() {
  return db.prepare("SELECT * FROM bank_accounts").all() as {
    id: string;
    iban: string;
    name: string;
    currency: string;
    gocardless_account_id: string;
    requisition_id: string;
  }[];
}

export function countTransactions(): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
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
  db.exec("DELETE FROM category_rules; DELETE FROM custom_categories; DELETE FROM hidden_categories; DELETE FROM category_limits;");
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
    if (hidden.has(row.category) || row.category === SKIP_STATS_CATEGORY) continue;
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
