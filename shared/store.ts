// The whole app, as data. No rules: the frontend reads this, decides, and writes it back.
import type { AccountProvider, CategoryLimitSetting, CategoryRule, PeriodEvaluation, PeriodNote, Transaction } from "./types.ts";

/** Account row as stored. Payment counts and date ranges are computed by the app, not saved. */
export type StoredAccount = {
  id: string;
  name: string;
  bank: string;
  iban: string;
  provider: AccountProvider;
  externalId: string;
  createdAt: string;
};

export type Store = {
  transactions: Transaction[];
  accounts: StoredAccount[];
  rules: CategoryRule[];
  customCategories: string[];
  hiddenCategories: string[];
  limits: CategoryLimitSetting[];
  /** Key/value: AI key and model, amount buckets, recurring overrides. */
  settings: Record<string, string>;
  evaluations: PeriodEvaluation[];
  /** Written summaries. A month note uses that month's first and last day; a custom one uses the chosen from–to. */
  notes: PeriodNote[];
};

export function emptyStore(): Store {
  return {
    transactions: [],
    accounts: [],
    rules: [],
    customCategories: [],
    hiddenCategories: [],
    limits: [],
    settings: {},
    evaluations: [],
    notes: [],
  };
}
