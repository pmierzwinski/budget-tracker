// The database handle. `db` resolves per call: the session database in hosted mode (AsyncLocalStorage),
// otherwise the lazily opened data/wydatki.db. Never keep a reference to the underlying database.
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { appRoot, hosted } from "../runtime.ts";

export type Row = Record<string, unknown>;

const scope = new AsyncLocalStorage<DatabaseSync>();
let fileDb: DatabaseSync | null = null;
let initSchema: () => void = () => {
  throw new Error("Schemat bazy nie jest zarejestrowany (importuj bazę przez db/index.ts albo schema.ts).");
};

/** Called once by schema.ts; runs on every newly opened database. */
export function registerSchema(init: () => void): void {
  initSchema = init;
}

function currentDb(): DatabaseSync {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  if (hosted) throw new Error("Sesja wygasła — odśwież stronę.");
  if (!fileDb) {
    const dataDir = join(appRoot, "data");
    mkdirSync(dataDir, { recursive: true });
    fileDb = openDatabase(join(dataDir, "wydatki.db"));
  }
  return fileDb;
}

export const db = new Proxy({} as DatabaseSync, {
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

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function changes(result: { changes: number | bigint }): number {
  return Number(result.changes || 0);
}

/** `WHERE`-less condition limited to one account when given. */
export function forAccount(condition: string, params: SQLInputValue[], account?: string) {
  return account
    ? { where: `${condition} AND account_id = ?`, params: [...params, account] }
    : { where: condition, params };
}
