// Accounts the payments belong to: list with counts, edits, matching a CSV import and linking bank accounts.
import type { Store, StoredAccount } from "../../../shared/store";
import type { Account, AccountProvider } from "../../../shared/types";

export type ImportFile = { bank: string; iban: string; bankName: string; accountName?: string };

export function normalizeIban(iban: string): string {
  return iban.replace(/[\s']/g, "").toUpperCase();
}

/** Accounts with payment counts and date ranges, oldest first. */
export function listAccounts(store: Store): Account[] {
  const totals = new Map<string, { count: number; minDate: string; maxDate: string }>();
  for (const tx of store.transactions) {
    const row = totals.get(tx.accountId) || { count: 0, minDate: tx.date, maxDate: tx.date };
    row.count += 1;
    if (tx.date < row.minDate) row.minDate = tx.date;
    if (tx.date > row.maxDate) row.maxDate = tx.date;
    totals.set(tx.accountId, row);
  }
  return [...store.accounts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ externalId: _externalId, createdAt: _createdAt, ...account }) => ({
      ...account,
      ...(totals.get(account.id) || { count: 0, minDate: "", maxDate: "" }),
    }));
}

export function getAccount(store: Store, id: string): Account | null {
  return listAccounts(store).find((row) => row.id === id) || null;
}

export function createAccount(
  draft: Store,
  input: { name: string; bank: string; iban?: string; provider?: AccountProvider; externalId?: string },
): StoredAccount {
  const name = input.name.trim();
  if (!name) throw new Error("Podaj nazwę konta.");
  if (name.length > 60) throw new Error("Nazwa konta może mieć najwyżej 60 znaków.");
  const account: StoredAccount = {
    id: crypto.randomUUID(),
    name,
    bank: input.bank.trim(),
    iban: normalizeIban(input.iban || ""),
    provider: input.provider || "",
    externalId: input.externalId || "",
    createdAt: new Date().toISOString(),
  };
  draft.accounts = [...draft.accounts, account];
  return account;
}

export function updateAccount(draft: Store, id: string, patch: { name?: string; iban?: string }): void {
  const account = draft.accounts.find((row) => row.id === id);
  if (!account) throw new Error("Nie znaleziono konta.");
  const name = patch.name != null ? patch.name.trim() : account.name;
  if (!name) throw new Error("Podaj nazwę konta.");
  const iban = patch.iban != null ? normalizeIban(patch.iban) : account.iban;
  draft.accounts = draft.accounts.map((row) => (row.id === id ? { ...row, name: name.slice(0, 60), iban } : row));
}

/** Deletes the account together with its payments; returns how many payments were removed. */
export function deleteAccount(draft: Store, id: string): number {
  const before = draft.transactions.length;
  draft.transactions = draft.transactions.filter((tx) => tx.accountId !== id);
  draft.accounts = draft.accounts.filter((row) => row.id !== id);
  return before - draft.transactions.length;
}

/** Matches by provider link, then by IBAN, then by bank (only when it is unambiguous). */
export function findAccount(
  store: Store,
  input: { iban?: string; bank?: string; provider?: AccountProvider; externalId?: string },
): StoredAccount | null {
  const iban = normalizeIban(input.iban || "");
  const byBank = input.bank ? store.accounts.filter((row) => row.bank === input.bank && (!iban || !row.iban)) : [];
  return (
    (input.provider && input.externalId
      ? store.accounts.find((row) => row.provider === input.provider && row.externalId === input.externalId)
      : undefined) ||
    (iban ? store.accounts.find((row) => row.iban && row.iban.slice(-26) === iban.slice(-26)) : undefined) ||
    (byBank.length === 1 ? byBank[0] : null)
  );
}

/** Existing account a CSV import lands on (`requested` = `auto`, `new` or an id); null = a new one. */
export function matchImport(store: Store, requested: string, file: ImportFile): StoredAccount | null {
  if (requested === "new") return null;
  return (
    (requested !== "auto" ? store.accounts.find((row) => row.id === requested) : undefined) ||
    findAccount(store, { iban: file.iban, bank: file.bank })
  );
}

export function importAccountName(requested: string, file: ImportFile): string {
  return (requested === "new" && file.accountName?.trim()) || file.bankName;
}

/** Account for a CSV import: the matched one (gets the file's IBAN when it had none) or a new one. */
export function resolveImport(draft: Store, requested: string, file: ImportFile): StoredAccount {
  const account =
    matchImport(draft, requested, file) ||
    createAccount(draft, { name: importAccountName(requested, file), bank: file.bank, iban: file.iban });
  if (file.iban && !account.iban) updateAccount(draft, account.id, { iban: file.iban });
  return draft.accounts.find((row) => row.id === account.id)!;
}

/** Finds (or creates) the local account for a bank-provider account and links it. */
export function upsertLinked(
  draft: Store,
  provider: Exclude<AccountProvider, "">,
  externalId: string,
  input: { bank: string; iban: string; label?: string },
): StoredAccount {
  const local =
    findAccount(draft, { provider, externalId, iban: input.iban }) ||
    createAccount(draft, {
      name: `${input.bank}${input.label ? ` · ${input.label}` : ""}${input.iban ? ` ··${input.iban.slice(-4)}` : ""}`,
      bank: input.bank,
      iban: input.iban,
    });
  const iban = normalizeIban(input.iban || "");
  const linked = { ...local, provider, externalId, iban: iban || local.iban };
  draft.accounts = draft.accounts.map((row) => (row.id === local.id ? linked : row));
  return linked;
}
