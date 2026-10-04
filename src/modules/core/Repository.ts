import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Database, Row } from "./Database.ts";

export type { Row };

/** A `WHERE` condition built from parts; `toString()` joins them with AND. */
export class SqlWhere {
  readonly #parts: string[] = [];
  readonly params: SQLInputValue[] = [];

  constructor(condition = "1=1", ...params: SQLInputValue[]) {
    this.add(condition, ...params);
  }

  add(condition: string, ...params: SQLInputValue[]): this {
    this.#parts.push(condition);
    this.params.push(...params);
    return this;
  }

  /** Limits the condition to one account when given. */
  forAccount(account?: string): this {
    return account ? this.add("account_id = ?", account) : this;
  }

  toString(): string {
    return this.#parts.join(" AND ");
  }
}

/** Base for table access: every query goes through the current connection (per request in hosted mode). */
export abstract class Repository {
  protected readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  protected get db(): DatabaseSync {
    return this.database.connection;
  }

  protected all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  protected one<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /** Runs a statement and returns the number of changed rows. */
  protected run(sql: string, ...params: SQLInputValue[]): number {
    return Number(this.db.prepare(sql).run(...params).changes || 0);
  }

  protected exec(sql: string): void {
    this.db.exec(sql);
  }

  protected transaction<T>(fn: () => T): T {
    return this.database.transaction(fn);
  }
}
