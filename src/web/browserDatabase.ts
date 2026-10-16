// The web version's database: SQLite compiled to WebAssembly (sql.js), saved as one file in IndexedDB.
// Nothing leaves the browser. Implements the node:sqlite subset the repositories use (core/Database.ts).
import initSqlJs from "sql.js";
import type { Database as SqlJsDatabase, Statement } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { Row, SqlConnection, SqlStatement, SqlValue } from "../modules/core/Database.ts";

const IDB_NAME = "wydatki";
const IDB_STORE = "files";
const IDB_KEY = "wydatki.db";
const CACHED_STATEMENTS = 200;

class SqlJsConnection implements SqlConnection {
  readonly #db: SqlJsDatabase;
  readonly #statements = new Map<string, Statement>();

  constructor(db: SqlJsDatabase) {
    this.#db = db;
  }

  prepare(sql: string): SqlStatement {
    return {
      all: (...params) => this.#rows(sql, params),
      get: (...params) => this.#rows(sql, params, 1)[0],
      run: (...params) => {
        this.#statement(sql).run(params as initSqlJs.BindParams);
        return { changes: this.#db.getRowsModified() };
      },
    };
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  /** `export()` frees every prepared statement in sql.js, so the cache goes first. */
  export(): Uint8Array {
    this.#clearCache();
    return this.#db.export();
  }

  #rows(sql: string, params: SqlValue[], limit = Infinity): Row[] {
    const statement = this.#statement(sql);
    const rows: Row[] = [];
    try {
      statement.bind(params as initSqlJs.BindParams);
      while (rows.length < limit && statement.step()) rows.push(statement.getAsObject() as Row);
    } finally {
      statement.reset();
    }
    return rows;
  }

  #statement(sql: string): Statement {
    let statement = this.#statements.get(sql);
    if (!statement) {
      if (this.#statements.size >= CACHED_STATEMENTS) this.#clearCache();
      statement = this.#db.prepare(sql);
      this.#statements.set(sql, statement);
    }
    return statement;
  }

  #clearCache(): void {
    for (const statement of this.#statements.values()) statement.free();
    this.#statements.clear();
  }
}

export class BrowserDatabase {
  readonly connection: SqlJsConnection;

  private constructor(connection: SqlJsConnection) {
    this.connection = connection;
  }

  static async open(): Promise<BrowserDatabase> {
    const [SQL, saved] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), readFile()]);
    void navigator.storage?.persist?.().catch(() => false);
    return new BrowserDatabase(new SqlJsConnection(saved ? new SQL.Database(saved) : new SQL.Database()));
  }

  save(): Promise<void> {
    return writeFile(this.connection.export());
  }
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFile(): Promise<Uint8Array | null> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result instanceof Uint8Array ? request.result : null);
    request.onerror = () => reject(request.error);
  });
}

async function writeFile(bytes: Uint8Array): Promise<void> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORE, "readwrite");
    transaction.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
