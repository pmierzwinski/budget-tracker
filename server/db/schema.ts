// Tables and hand-written migrations, run on every opened database.
// A new column = a new block in migrateColumns; a data migration = a function guarded by a settings flag.
import { randomUUID } from "node:crypto";
import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import { LEGACY_SKIP_CATEGORY, categorizer } from "../categorize.ts";
import { hiddenCategoryNames } from "./categories.ts";
import { db, registerSchema, transaction, type Row } from "./core.ts";
import { listRules } from "./rules.ts";
import { rowToTx } from "./rows.ts";

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
  const has = (name: string) => cols.some((col) => col.name === name);
  if (!has("comment")) db.exec("ALTER TABLE transactions ADD COLUMN comment TEXT NOT NULL DEFAULT ''");
  if (!has("excluded")) db.exec("ALTER TABLE transactions ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
  if (!has("account_id")) db.exec("ALTER TABLE transactions ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)");
}

/** Runs `migrate` once per database, remembering it under `key` in settings. */
function once(key: string, migrate: () => void): void {
  if (db.prepare("SELECT value FROM settings WHERE key = ?").get(key)) return;
  transaction(() => {
    migrate();
    db.prepare("INSERT INTO settings (key, value) VALUES (?, '1')").run(key);
  });
}

/** `date` used to hold the operation date; it now holds the value (booking) date. */
function migrateValueDate(): void {
  db.exec(`
    UPDATE transactions SET date = booking_date, booking_date = date
      WHERE booking_date IS NOT NULL AND booking_date <> '' AND booking_date <> date;
  `);
}

/** The old "Poza statystykami" category became the `excluded` flag; those payments get a real category. */
function migrateSkipFlag(): void {
  const categorize = categorizer(
    listRules().filter((rule) => rule.category !== LEGACY_SKIP_CATEGORY),
    [...hiddenCategoryNames(), LEGACY_SKIP_CATEGORY],
  );
  const rows = db.prepare("SELECT * FROM transactions WHERE category = ?").all(LEGACY_SKIP_CATEGORY) as Row[];
  const update = db.prepare("UPDATE transactions SET excluded = 1, category = ? WHERE id = ?");
  for (const row of rows) {
    const tx = rowToTx(row);
    update.run(categorize(tx), tx.id);
  }
  db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(DEFAULT_CATEGORY, LEGACY_SKIP_CATEGORY);
  db.prepare("DELETE FROM category_limits WHERE category = ?").run(LEGACY_SKIP_CATEGORY);
  db.prepare("DELETE FROM custom_categories WHERE name = ?").run(LEGACY_SKIP_CATEGORY);
}

/** Payments from before multi-account support go to a "PKO BP" account. */
function migrateAccounts(): void {
  const orphans = Number(
    (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ''").get() as { n: number }).n,
  );
  if (!orphans) return;
  const id = randomUUID();
  db.prepare("INSERT INTO accounts (id, name, bank, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    "PKO BP",
    "pko",
    new Date().toISOString(),
  );
  db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ''").run(id);
}

registerSchema(() => {
  db.exec(SCHEMA);
  migrateColumns();
  once("migration.value_date", migrateValueDate);
  once("migration.skip_flag", migrateSkipFlag);
  once("migration.accounts", migrateAccounts);
});
