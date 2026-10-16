import type { Account, AccountProvider } from "../shared/types.ts";
import type { Database } from "../core/Database.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import { AccountRepository, type LinkedAccount } from "./AccountRepository.ts";

type AccountMatch = { iban?: string; bank?: string; provider?: AccountProvider; externalId?: string };

export type ImportFile = { bank: string; iban: string; bankName: string; accountName?: string };

/** Accounts the payments belong to: CRUD, matching imports by IBAN/bank and linking Open Banking accounts. */
export class AccountService {
  readonly #database: Database;
  readonly #accounts: AccountRepository;
  readonly #transactions: TransactionRepository;

  constructor(database: Database, accounts: AccountRepository, transactions: TransactionRepository) {
    this.#database = database;
    this.#accounts = accounts;
    this.#transactions = transactions;
  }

  list(): Account[] {
    return this.#accounts.list().map(AccountRepository.toPublic);
  }

  get(id: string): Account | null {
    const row = this.#accounts.find(id);
    return row ? AccountRepository.toPublic(row) : null;
  }

  /** Accounts linked to a bank provider, with their external ids. */
  linked(provider: AccountProvider): LinkedAccount[] {
    return this.#accounts.list().filter((row) => row.provider === provider);
  }

  create(input: { name: string; bank: string; iban?: string; provider?: AccountProvider; externalId?: string }): Account {
    const name = input.name.trim();
    if (!name) throw new Error("Podaj nazwę konta.");
    if (name.length > 60) throw new Error("Nazwa konta może mieć najwyżej 60 znaków.");
    const id = this.#accounts.insert({
      name,
      bank: input.bank.trim(),
      iban: AccountRepository.normalizeIban(input.iban || ""),
      provider: input.provider,
      externalId: input.externalId,
    });
    return this.get(id)!;
  }

  update(id: string, patch: { name?: string; iban?: string }): Account {
    const account = this.get(id);
    if (!account) throw new Error("Nie znaleziono konta.");
    const name = patch.name != null ? patch.name.trim() : account.name;
    if (!name) throw new Error("Podaj nazwę konta.");
    const iban = patch.iban != null ? AccountRepository.normalizeIban(patch.iban) : account.iban;
    this.#accounts.update(id, name.slice(0, 60), iban);
    return this.get(id)!;
  }

  /** Deletes the account together with its payments; returns how many payments were removed. */
  delete(id: string): number {
    return this.#database.transaction(() => {
      const removed = this.#transactions.deleteByAccount(id);
      this.#accounts.delete(id);
      return removed;
    });
  }

  deleteByName(name: string): void {
    const existing = this.list().find((row) => row.name === name);
    if (existing) this.delete(existing.id);
  }

  /** Matches an account by provider link, then by IBAN, then by bank (only when it is unambiguous). */
  find(input: AccountMatch): Account | null {
    const accounts = this.#accounts.list();
    const iban = AccountRepository.normalizeIban(input.iban || "");
    const match =
      (input.provider && input.externalId
        ? accounts.find((row) => row.provider === input.provider && row.externalId === input.externalId)
        : undefined) ||
      (iban ? accounts.find((row) => row.iban && row.iban.slice(-26) === iban.slice(-26)) : undefined) ||
      (input.bank ? AccountService.#single(accounts.filter((row) => row.bank === input.bank && (!iban || !row.iban))) : undefined);
    return match ? AccountRepository.toPublic(match) : null;
  }

  /** Finds (or creates) the local account for a bank-provider account and links it. */
  upsertLinked(
    provider: Exclude<AccountProvider, "">,
    externalId: string,
    input: { bank: string; iban: string; label?: string },
  ): Account {
    const local =
      this.find({ provider, externalId, iban: input.iban }) ||
      this.create({
        name: `${input.bank}${input.label ? ` · ${input.label}` : ""}${input.iban ? ` ··${input.iban.slice(-4)}` : ""}`,
        bank: input.bank,
        iban: input.iban,
      });
    this.#accounts.link(local.id, provider, externalId, AccountRepository.normalizeIban(input.iban || ""));
    return local;
  }

  /** Account for a CSV import: an explicit id, a new one, or auto (IBAN, then bank, otherwise new). */
  resolveImport(requested: string, file: ImportFile): Account {
    let account =
      this.matchImport(requested, file) ||
      this.create({ name: AccountService.importName(requested, file), bank: file.bank, iban: file.iban });
    if (file.iban && !account.iban) account = this.update(account.id, { iban: file.iban });
    return account;
  }

  /** Existing account a CSV import would land on; `null` = `resolveImport` creates one named `importName`. */
  matchImport(requested: string, file: ImportFile): Account | null {
    if (requested === "new") return null;
    return (requested !== "auto" ? this.get(requested) : null) || this.find({ iban: file.iban, bank: file.bank });
  }

  static importName(requested: string, file: ImportFile): string {
    return (requested === "new" && file.accountName?.trim()) || file.bankName;
  }

  static #single<T>(items: T[]): T | undefined {
    return items.length === 1 ? items[0] : undefined;
  }
}
