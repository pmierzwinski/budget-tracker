// Talking to the local server about the bank connection, and saving what a sync fetched.
import type { Store } from "../../../../../shared/store";
import type { BankFetch, BankServerStatus, Institution, SyncResult } from "../../../../../shared/types";
import type { Database } from "../../../../db";
import { upsertLinked } from "../../../../modules/accounts";
import { categorizer } from "../../../../modules/categories";
import { insertTransactions, newTransaction } from "../../../../modules/payments";

export type Provider = "enablebanking" | "gocardless";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetch(`/api/bank${path}`, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Żądanie nie powiodło się");
  return data;
}

export const bank = {
  status: () => request<BankServerStatus>("/status"),
  institutions: (provider: Provider) =>
    provider === "enablebanking"
      ? request<{ aspsps: Institution[] }>("/enablebanking/aspsps").then((data) => data.aspsps)
      : request<{ institutions: Institution[] }>("/gocardless/institutions").then((data) => data.institutions),
  saveEnableBankingKeys: (appId: string, privateKey: string) => request("/enablebanking/keys", { appId, privateKey }),
  saveGoCardlessSecrets: (secretId: string, secretKey: string) => request("/gocardless/secrets", { secretId, secretKey }),
  connectEnableBanking: (aspsp: string) => request<{ link: string }>("/enablebanking/connect", { aspsp }),
  connectGoCardless: (input: { sandbox: boolean; institutionId?: string; institutionName?: string }) =>
    request<{ link: string }>("/gocardless/connect", input),
};

/** Fetches payments of the linked bank accounts and stores them (accounts are created/linked by IBAN or bank id). */
export async function syncBank(database: Database, provider: Provider): Promise<SyncResult> {
  const known = [...new Set(database.data.transactions.filter((tx) => tx.source === provider).map((tx) => tx.accountId))]
    .map((id) => database.data.accounts.find((row) => row.id === id)?.externalId)
    .filter(Boolean);
  const fetched = await request<BankFetch>(`/${provider}/fetch`, { known });
  return database.update((draft) => saveFetched(draft, provider, fetched));
}

function saveFetched(draft: Store, provider: Provider, fetched: BankFetch): SyncResult {
  const categorize = categorizer(draft);
  const items = fetched.accounts.flatMap((account) => {
    const local = upsertLinked(draft, provider, account.externalId, { bank: account.bank, iban: account.iban, label: account.label });
    return account.transactions.map((tx) =>
      newTransaction({ ...tx, accountId: local.id, accountIban: local.iban, category: categorize(tx), source: provider }),
    );
  });
  return { ...insertTransactions(draft, items), accounts: fetched.accounts.length, total: items.length };
}
