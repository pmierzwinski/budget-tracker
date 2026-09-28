import { randomUUID } from "node:crypto";
import type { Account, AccountProvider } from "../../shared/types.ts";
import { changes, db, transaction, type Row } from "./core.ts";
import { rowToAccount } from "./rows.ts";

type AccountRow = Account & { externalId: string };

function accountRows(id?: string): AccountRow[] {
  const rows = db
    .prepare(
      `SELECT a.*, COUNT(t.id) AS count, MIN(t.date) AS min_date, MAX(t.date) AS max_date
       FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
       ${id ? "WHERE a.id = ?" : ""}
       GROUP BY a.id
       ORDER BY a.created_at ASC`,
    )
    .all(...(id ? [id] : [])) as Row[];
  return rows.map((row) => ({ ...rowToAccount(row), externalId: String(row.external_id ?? "") }));
}

function publicAccount({ externalId: _externalId, ...account }: AccountRow): Account {
  return account;
}

export function listAccounts(): Account[] {
  return accountRows().map(publicAccount);
}

export function getAccount(id: string): Account | null {
  const row = accountRows(id)[0];
  return row ? publicAccount(row) : null;
}

function normalizeIban(iban: string): string {
  return iban.replace(/[\s']/g, "").toUpperCase();
}

export function createAccount(input: {
  name: string;
  bank: string;
  iban?: string;
  provider?: AccountProvider;
  externalId?: string;
}): Account {
  const name = input.name.trim();
  if (!name) throw new Error("Podaj nazwę konta.");
  if (name.length > 60) throw new Error("Nazwa konta może mieć najwyżej 60 znaków.");
  const id = randomUUID();
  db.prepare(
    "INSERT INTO accounts (id, name, bank, iban, provider, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    name,
    input.bank.trim(),
    normalizeIban(input.iban || ""),
    input.provider || "",
    input.externalId || "",
    new Date().toISOString(),
  );
  return getAccount(id)!;
}

export function updateAccount(id: string, patch: { name?: string; iban?: string }): Account {
  const account = getAccount(id);
  if (!account) throw new Error("Nie znaleziono konta.");
  const name = patch.name != null ? patch.name.trim() : account.name;
  if (!name) throw new Error("Podaj nazwę konta.");
  const iban = patch.iban != null ? normalizeIban(patch.iban) : account.iban;
  db.prepare("UPDATE accounts SET name = ?, iban = ? WHERE id = ?").run(name.slice(0, 60), iban, id);
  return getAccount(id)!;
}

/** Deletes the account together with its payments; returns how many payments were removed. */
export function deleteAccount(id: string): number {
  return transaction(() => {
    const removed = changes(db.prepare("DELETE FROM transactions WHERE account_id = ?").run(id));
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    return removed;
  });
}

export function deleteAccountByName(name: string): void {
  const existing = listAccounts().find((row) => row.name === name);
  if (existing) deleteAccount(existing.id);
}

/** Matches an account by provider link, then by IBAN, then by bank (only when it is unambiguous). */
export function findAccount(input: {
  iban?: string;
  bank?: string;
  provider?: AccountProvider;
  externalId?: string;
}): Account | null {
  const accounts = accountRows();
  const iban = normalizeIban(input.iban || "");
  const match =
    (input.provider && input.externalId
      ? accounts.find((row) => row.provider === input.provider && row.externalId === input.externalId)
      : undefined) ||
    (iban ? accounts.find((row) => row.iban && row.iban.slice(-26) === iban.slice(-26)) : undefined) ||
    (input.bank ? single(accounts.filter((row) => row.bank === input.bank && (!iban || !row.iban))) : undefined);
  return match ? publicAccount(match) : null;
}

function single<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

export function linkAccount(id: string, input: { provider: AccountProvider; externalId: string; iban?: string }): void {
  const iban = normalizeIban(input.iban || "");
  db.prepare(
    "UPDATE accounts SET provider = ?, external_id = ?, iban = CASE WHEN ? <> '' THEN ? ELSE iban END WHERE id = ?",
  ).run(input.provider, input.externalId, iban, iban, id);
}

/** Finds (or creates) the local account for a bank-provider account and links it. */
export function upsertLinkedAccount(
  provider: Exclude<AccountProvider, "">,
  externalId: string,
  input: { bank: string; iban: string; label?: string },
): Account {
  const local =
    findAccount({ provider, externalId, iban: input.iban }) ||
    createAccount({
      name: `${input.bank}${input.label ? ` · ${input.label}` : ""}${input.iban ? ` ··${input.iban.slice(-4)}` : ""}`,
      bank: input.bank,
      iban: input.iban,
    });
  linkAccount(local.id, { provider, externalId, iban: input.iban });
  return local;
}

export function linkedAccounts(provider: AccountProvider): AccountRow[] {
  return accountRows().filter((row) => row.provider === provider);
}

/** Account for a CSV import: an explicit id, a new one, or auto (IBAN, then bank, otherwise new). */
export function resolveImportAccount(
  requested: string,
  file: { bank: string; iban: string; bankName: string; accountName?: string },
): Account {
  let account = requested !== "auto" && requested !== "new" ? getAccount(requested) : null;
  if (requested === "new") {
    account = createAccount({ name: file.accountName?.trim() || file.bankName, bank: file.bank, iban: file.iban });
  }
  if (!account) {
    account =
      findAccount({ iban: file.iban, bank: file.bank }) ||
      createAccount({ name: file.bankName, bank: file.bank, iban: file.iban });
  }
  if (file.iban && !account.iban) account = updateAccount(account.id, { iban: file.iban });
  return account;
}
