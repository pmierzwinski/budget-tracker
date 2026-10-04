import { randomUUID } from "node:crypto";
import type { Account, AccountProvider } from "../shared/types.ts";
import { Repository, type Row } from "../core/Repository.ts";

/** An account with its provider link (never sent to the front). */
export type LinkedAccount = Account & { externalId: string };

export type NewAccount = { name: string; bank: string; iban: string; provider?: AccountProvider; externalId?: string };

export class AccountRepository extends Repository {
  static normalizeIban(iban: string): string {
    return iban.replace(/[\s']/g, "").toUpperCase();
  }

  static toPublic({ externalId: _externalId, ...account }: LinkedAccount): Account {
    return account;
  }

  static #fromRow(row: Row): LinkedAccount {
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      bank: String(row.bank ?? ""),
      iban: String(row.iban ?? ""),
      provider: (String(row.provider ?? "") as Account["provider"]) || "",
      count: Number(row.count || 0),
      minDate: String(row.min_date ?? ""),
      maxDate: String(row.max_date ?? ""),
      externalId: String(row.external_id ?? ""),
    };
  }

  /** Accounts with payment counts and date ranges, oldest first. */
  list(id?: string): LinkedAccount[] {
    return this.all(
      `SELECT a.*, COUNT(t.id) AS count, MIN(t.date) AS min_date, MAX(t.date) AS max_date
       FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
       ${id ? "WHERE a.id = ?" : ""}
       GROUP BY a.id
       ORDER BY a.created_at ASC`,
      ...(id ? [id] : []),
    ).map((row) => AccountRepository.#fromRow(row));
  }

  find(id: string): LinkedAccount | undefined {
    return this.list(id)[0];
  }

  /** Stores the account as given (IBAN already normalized); returns its id. */
  insert(input: NewAccount): string {
    const id = randomUUID();
    this.run(
      "INSERT INTO accounts (id, name, bank, iban, provider, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      input.name,
      input.bank,
      input.iban,
      input.provider || "",
      input.externalId || "",
      new Date().toISOString(),
    );
    return id;
  }

  update(id: string, name: string, iban: string): void {
    this.run("UPDATE accounts SET name = ?, iban = ? WHERE id = ?", name, iban, id);
  }

  /** Links to a provider account; an empty IBAN keeps the current one. */
  link(id: string, provider: AccountProvider, externalId: string, iban: string): void {
    this.run(
      "UPDATE accounts SET provider = ?, external_id = ?, iban = CASE WHEN ? <> '' THEN ? ELSE iban END WHERE id = ?",
      provider,
      externalId,
      iban,
      iban,
      id,
    );
  }

  delete(id: string): void {
    this.run("DELETE FROM accounts WHERE id = ?", id);
  }

  clear(): void {
    this.exec("DELETE FROM accounts;");
  }
}
