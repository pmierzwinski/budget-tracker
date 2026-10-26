// Putting payments into the store: CSV statements, the demo account and clearing the data.
import { DEFAULT_CATEGORY } from "../../../shared/domain";
import type { Store } from "../../../shared/store";
import type { DemoResult, ImportPreview, ImportResult } from "../../../shared/types";
import type { Database } from "../../db";
import { createAccount, deleteAccount, getAccount, importAccountName, listAccounts, matchImport, resolveImport } from "../accounts/accounts";
import { categorizeWithAi, type AiEnv } from "../ai/ai";
import { categorizer } from "../categories/categories";
import { dateBounds, insertTransactions, ofAccount } from "../payments/transactions";
import { bankName } from "./csv/banks";
import { parseStatement } from "./csv/parse";
import { demoTransactions } from "./demo";

export const DEMO_ACCOUNT = "Konto testowe";
export const DEMO_RAW_ACCOUNT = "Konto testowe bez kategorii";

/** `account` = `auto`, `new` or an account id. */
export type ImportOptions = { account?: string; accountName?: string; bank?: string; replaceCsv?: boolean; ai?: boolean };

async function readStatement(store: Store, file: File, options: ImportOptions) {
  const parsed = parseStatement(new Uint8Array(await file.arrayBuffer()), { bank: options.bank, categorize: categorizer(store) });
  const info = { bank: parsed.bank, iban: parsed.iban, bankName: bankName(parsed.bank), accountName: options.accountName };
  return { parsed, info, requested: options.account || "auto" };
}

/** What `importFile` would add, without saving anything. */
export async function previewImport(database: Database, file: File, options: ImportOptions): Promise<ImportPreview> {
  const store = database.data;
  const { parsed, info, requested } = await readStatement(store, file, options);
  const account = matchImport(store, requested, info);
  const replaced = options.replaceCsv && account ? account.id : "";
  const existing = new Set(
    store.transactions.filter((tx) => !(replaced && tx.source === "csv" && tx.accountId === replaced)).map((tx) => tx.id),
  );
  const fresh = parsed.items.filter((item) => !existing.has(item.id));
  const dates = parsed.items.map((item) => item.date).sort();
  return {
    total: parsed.items.length,
    fresh: fresh.length,
    duplicates: parsed.items.length - fresh.length,
    categorized: fresh.filter((item) => item.category && item.category !== DEFAULT_CATEGORY).length,
    bank: parsed.bank,
    bankName: info.bankName,
    account: account ? { id: account.id, name: account.name } : { id: "", name: importAccountName(requested, info) },
    minDate: dates[0] || "",
    maxDate: dates.at(-1) || "",
  };
}

/** Re-importing the same file skips duplicates; `replaceCsv` first drops the account's CSV payments. */
export async function importFile(database: Database, env: AiEnv, file: File, options: ImportOptions): Promise<ImportResult> {
  const { parsed, info, requested } = await readStatement(database.data, file, options);
  const { accountId, inserted } = await database.update((draft) => {
    const account = resolveImport(draft, requested, info);
    const items = parsed.items.map((item) => ({ ...item, accountId: account.id }));
    return { accountId: account.id, inserted: insertTransactions(draft, items, { replaceCsvFor: options.replaceCsv ? account.id : undefined }) };
  });
  const ai = options.ai && inserted.ids.length ? await categorizeWithAi(database, env, inserted.ids) : null;
  const store = database.data;
  return {
    ...inserted,
    total: parsed.items.length,
    ai,
    bank: parsed.bank,
    bankName: info.bankName,
    account: getAccount(store, accountId)!,
    accounts: listAccounts(store),
    ...dateBounds(ofAccount(store.transactions, accountId)),
  };
}

/** Recreates the demo account (by name); `uncategorized` puts everything in "Inne" to try rules and AI. */
export async function importDemo(database: Database, options: { uncategorized?: boolean } = {}): Promise<DemoResult> {
  const name = options.uncategorized ? DEMO_RAW_ACCOUNT : DEMO_ACCOUNT;
  const { accountId, inserted } = await database.update((draft) => {
    const old = draft.accounts.find((row) => row.name === name);
    if (old) deleteAccount(draft, old.id);
    const account = createAccount(draft, { name, bank: "generic" });
    const items = demoTransactions(account.id, { categorize: categorizer(draft), uncategorized: options.uncategorized });
    return { accountId: account.id, inserted: { ...insertTransactions(draft, items), total: items.length } };
  });
  const store = database.data;
  return {
    ...inserted,
    account: getAccount(store, accountId)!,
    accounts: listAccounts(store),
    ...dateBounds(store.transactions),
  };
}

/** Kept by a full reset: pasted API keys. */
const KEEP_ON_RESET = ["openai_api_key", "ai_api_key", "ai_provider", "ai_model", "ai_base_url"];

/** `all` = full reset: payments, accounts, rules, custom categories, limits and settings (API keys stay). */
export function clearData(draft: Store, all: boolean): void {
  draft.transactions = [];
  draft.evaluations = [];
  draft.notes = [];
  if (!all) return;
  draft.accounts = [];
  draft.rules = [];
  draft.customCategories = [];
  draft.hiddenCategories = [];
  draft.limits = [];
  draft.settings = Object.fromEntries(Object.entries(draft.settings).filter(([key]) => KEEP_ON_RESET.includes(key)));
}
