// The data file: data/wydatki.json. Before the first save it is read once from the old data/wydatki.db
// (that file stays untouched as a backup).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import { emptyStore, type Store, type StoredAccount } from "../shared/store.ts";
import type { AccountProvider, CategoryRule, PeriodEvaluation, Transaction } from "../shared/types.ts";

type Row = Record<string, unknown>;

function jsonFile(appRoot: string): string {
  return join(appRoot, "data", "wydatki.json");
}

/** The JSON file once the app has saved anything; until then, a plain copy of the old sqlite file. */
export function readStore(appRoot: string): Store {
  const file = jsonFile(appRoot);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Store;
  const dbFile = join(appRoot, "data", "wydatki.db");
  if (!existsSync(dbFile)) return emptyStore();
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    return {
      transactions: rows(db, "SELECT * FROM transactions").map(transaction),
      accounts: rows(db, "SELECT * FROM accounts").map(account),
      rules: rows(db, "SELECT * FROM category_rules").map(rule),
      customCategories: rows(db, "SELECT name FROM custom_categories").map((row) => text(row.name)),
      hiddenCategories: rows(db, "SELECT name FROM hidden_categories").map((row) => text(row.name)),
      limits: rows(db, "SELECT * FROM category_limits").map((row) => ({
        category: text(row.category),
        monthlyLimit: Number(row.monthly_limit),
      })),
      settings: Object.fromEntries(rows(db, "SELECT key, value FROM settings").map((row) => [text(row.key), text(row.value)])),
      evaluations: rows(db, "SELECT * FROM period_evaluations").map(evaluation),
      notes: [],
    };
  } finally {
    db.close();
  }
}

export function writeStore(appRoot: string, store: Store): void {
  const file = jsonFile(appRoot);
  mkdirSync(join(appRoot, "data"), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(store));
  renameSync(`${file}.tmp`, file);
}

function rows(db: DatabaseSync, sql: string): Row[] {
  return db.prepare(sql).all() as Row[];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function transaction(row: Row): Transaction {
  return {
    id: text(row.id),
    date: text(row.date),
    bookingDate: text(row.booking_date),
    amount: Number(row.amount),
    currency: text(row.currency) || "PLN",
    type: text(row.type),
    payee: text(row.payee),
    title: text(row.title),
    description: text(row.description),
    accountIban: text(row.account_iban),
    accountId: text(row.account_id),
    category: text(row.category) || DEFAULT_CATEGORY,
    comment: text(row.comment),
    excluded: Number(row.excluded || 0) === 1,
    manualCategory: Number(row.manual_category || 0) === 1,
    source: (text(row.source) as Transaction["source"]) || "csv",
    externalId: text(row.external_id),
    createdAt: text(row.created_at),
  };
}

function account(row: Row): StoredAccount {
  return {
    id: text(row.id),
    name: text(row.name),
    bank: text(row.bank),
    iban: text(row.iban),
    provider: (text(row.provider) as AccountProvider) || "",
    externalId: text(row.external_id),
    createdAt: text(row.created_at),
  };
}

function rule(row: Row): CategoryRule {
  return {
    id: text(row.id),
    pattern: text(row.pattern),
    category: text(row.category),
    createdAt: text(row.created_at),
  };
}

function evaluation(row: Row): PeriodEvaluation {
  return {
    scope: text(row.scope),
    from: text(row.from_date),
    to: text(row.to_date),
    label: text(row.label),
    text: text(row.text),
    createdAt: text(row.created_at),
  };
}
