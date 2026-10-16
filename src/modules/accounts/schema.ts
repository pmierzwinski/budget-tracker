import type { Database, Migration, ModuleSchema } from "../core/Database.ts";

const TABLES = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    bank TEXT NOT NULL DEFAULT '',
    iban TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    external_id TEXT NOT NULL DEFAULT '',
    created_at TEXT
  );
`;

/** Payments from before multi-account support go to a "PKO BP" account. */
class AccountsMigration implements Migration {
  readonly key = "migration.accounts";
  readonly #database: Database;

  constructor(database: Database) {
    this.#database = database;
  }

  run(): void {
    const db = this.#database.connection;
    const orphans = Number(
      (db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE account_id = ''").get() as { n: number }).n,
    );
    if (!orphans) return;
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO accounts (id, name, bank, created_at) VALUES (?, ?, ?, ?)").run(
      id,
      "PKO BP",
      "pko",
      new Date().toISOString(),
    );
    db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ''").run(id);
  }
}

export function accountsSchema(database: Database): ModuleSchema {
  return { tables: TABLES, migrations: [new AccountsMigration(database)] };
}
