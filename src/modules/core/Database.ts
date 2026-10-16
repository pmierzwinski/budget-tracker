// The database handle, free of Node: the server opens data/wydatki.db with node:sqlite, the web version an
// SQLite WASM database kept in the browser. Never keep a reference to the underlying connection.
export type Row = Record<string, unknown>;

export type SqlValue = null | number | bigint | string | Uint8Array;

/** The part of node:sqlite's StatementSync the app uses; the web version implements it on sql.js. */
export interface SqlStatement {
  all(...params: SqlValue[]): Row[];
  get(...params: SqlValue[]): Row | undefined;
  run(...params: SqlValue[]): { changes: number | bigint };
}

export interface SqlConnection {
  prepare(sql: string): SqlStatement;
  exec(sql: string): void;
}

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
  readonly #connect: () => SqlConnection;
  readonly #schemas: ModuleSchema[] = [];
  #connection: SqlConnection | null = null;
  #opening: SqlConnection | null = null;

  /** `connect` opens the database on first use; its schema is brought up to date right after. */
  constructor(connect: () => SqlConnection) {
    this.#connect = connect;
  }

  register(...schemas: ModuleSchema[]): void {
    this.#schemas.push(...schemas);
  }

  get connection(): SqlConnection {
    if (this.#opening) return this.#opening;
    if (!this.#connection) this.#connection = this.#initialize(this.#connect());
    return this.#connection;
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

  #initialize(connection: SqlConnection): SqlConnection {
    this.#opening = connection;
    try {
      for (const schema of this.#schemas) if (schema.tables) connection.exec(schema.tables);
      for (const schema of this.#schemas) {
        for (const column of schema.columns || []) this.#addColumn(column);
        if (schema.afterColumns) connection.exec(schema.afterColumns);
      }
      for (const schema of this.#schemas) for (const migration of schema.migrations || []) this.#runOnce(migration);
    } finally {
      this.#opening = null;
    }
    return connection;
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
