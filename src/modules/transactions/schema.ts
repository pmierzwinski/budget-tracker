import type { Database, Migration, ModuleSchema } from "../core/Database.ts";

const TABLES = `
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

  CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    iban TEXT,
    name TEXT,
    currency TEXT,
    gocardless_account_id TEXT,
    requisition_id TEXT
  );
`;

/** `date` used to hold the operation date; it now holds the value (booking) date. */
class ValueDateMigration implements Migration {
  readonly key = "migration.value_date";
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  run(): void {
    this.#database.connection.exec(`
      UPDATE transactions SET date = booking_date, booking_date = date
        WHERE booking_date IS NOT NULL AND booking_date <> '' AND booking_date <> date;
    `);
  }
}

export function transactionsSchema(database: Database): ModuleSchema {
  return {
    tables: TABLES,
    columns: [
      { table: "transactions", column: "comment", ddl: "TEXT NOT NULL DEFAULT ''" },
      { table: "transactions", column: "excluded", ddl: "INTEGER NOT NULL DEFAULT 0" },
      { table: "transactions", column: "account_id", ddl: "TEXT NOT NULL DEFAULT ''" },
      { table: "transactions", column: "manual_category", ddl: "INTEGER NOT NULL DEFAULT 0" },
    ],
    afterColumns: "CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)",
    migrations: [new ValueDateMigration(database)],
  };
}
