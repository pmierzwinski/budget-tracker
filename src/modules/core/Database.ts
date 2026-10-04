// The database handle. `connection` resolves per call: the session database in hosted mode (AsyncLocalStorage),
// otherwise the lazily opened data/wydatki.db. Never keep a reference to the underlying database.
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Runtime } from "./Runtime.ts";

export type Row = Record<string, unknown>;

/** A one-off data migration, remembered under `key` in settings so it runs once per database. */
export interface Migration {
  readonly key: string;
  run(): void;
}

export type ColumnMigration = { table: string; column: string; ddl: string };

/**
 * What a module needs in the database. Tables first (all modules), then new columns, then `afterColumns`
 * (e.g. indexes on those columns), then migrations — in the order the modules were registered.
 */
export interface ModuleSchema {
  tables?: string;
  columns?: ColumnMigration[];
  afterColumns?: string;
  migrations?: Migration[];
}

export class Database {
  readonly #scope = new AsyncLocalStorage<DatabaseSync>();
  readonly #runtime: Runtime;
  readonly #schemas: ModuleSchema[] = [];
  #file: DatabaseSync | null = null;

  constructor(runtime: Runtime) {
    this.#runtime = runtime;
  }

  register(...schemas: ModuleSchema[]): void {
    this.#schemas.push(...schemas);
  }

  get connection(): DatabaseSync {
    const scoped = this.#scope.getStore();
    if (scoped) return scoped;
    if (this.#runtime.hosted) throw new Error("Sesja wygasła — odśwież stronę.");
    if (!this.#file) {
      const dataDir = join(this.#runtime.appRoot, "data");
      mkdirSync(dataDir, { recursive: true });
      this.#file = this.open(join(dataDir, "wydatki.db"));
    }
    return this.#file;
  }

  /** Opens a database (in memory by default) and brings its schema up to date. */
  open(path = ":memory:"): DatabaseSync {
    const database = new DatabaseSync(path);
    this.#scope.run(database, () => this.#initialize());
    return database;
  }

  within<T>(database: DatabaseSync, fn: () => T): T {
    return this.#scope.run(database, fn);
  }

  transaction<T>(fn: () => T): T {
    const connection = this.connection;
    connection.exec("BEGIN");
    try {
      const result = fn();
      connection.exec("COMMIT");
      return result;
    } catch (error) {
      connection.exec("ROLLBACK");
      throw error;
    }
  }

  #initialize(): void {
    const connection = this.connection;
    for (const schema of this.#schemas) if (schema.tables) connection.exec(schema.tables);
    for (const schema of this.#schemas) {
      for (const column of schema.columns || []) this.#addColumn(column);
      if (schema.afterColumns) connection.exec(schema.afterColumns);
    }
    for (const schema of this.#schemas) for (const migration of schema.migrations || []) this.#runOnce(migration);
  }

  #addColumn({ table, column, ddl }: ColumnMigration): void {
    const columns = this.connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((row) => row.name === column)) this.connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }

  #runOnce(migration: Migration): void {
    const connection = this.connection;
    if (connection.prepare("SELECT value FROM settings WHERE key = ?").get(migration.key)) return;
    this.transaction(() => {
      migration.run();
      connection.prepare("INSERT INTO settings (key, value) VALUES (?, '1')").run(migration.key);
    });
  }
}
