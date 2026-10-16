import type { Transaction } from "../shared/types.ts";

/** What a provider sync fetched (not yet stored). */
export type FetchedTransactions = { imported: Transaction[]; accounts: number };

/** An Open Banking provider (Strategy): fetches payments of the linked accounts. */
export interface BankProvider {
  fetchTransactions(): Promise<FetchedTransactions>;
}
