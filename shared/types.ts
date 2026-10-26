// Data shapes shared by the server and the frontend.
import type { AiPublic } from "./ai.ts";

/** `gocardless` is only on payments imported before that connection was removed. */
export type TransactionSource = "csv" | "gocardless" | "enablebanking" | "demo";

export type Transaction = {
  id: string;
  date: string;
  bookingDate: string;
  amount: number;
  currency: string;
  type: string;
  payee: string;
  title: string;
  description: string;
  accountIban: string;
  accountId: string;
  category: string;
  comment: string;
  excluded: boolean;
  /** Set when the user picked a category for this payment only; rules skip it unless forced. */
  manualCategory: boolean;
  source: TransactionSource;
  externalId: string;
  createdAt: string;
};

export type TxSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category_asc" | "category_desc";

export type TxKind = "all" | "expense" | "income";

type TxFilterBase = {
  from?: string;
  to?: string;
  category?: string;
  q?: string;
  kind?: TxKind;
  sort?: TxSort;
  includeExcluded?: boolean;
  excludedOnly?: boolean;
  weekday?: number;
};

/** Filters as the frontend sends them (amounts typed by the user, comma allowed). */
export type TxQuery = TxFilterBase & { minAmount?: string; maxAmount?: string };

/** Filters parsed by the server. */
export type TxFilters = TxFilterBase & { minAmount?: number; maxAmount?: number; account?: string; limit?: number };

export type RecurringStatus = "auto" | "active" | "ended" | "hidden";

export type AmountBucket = {
  id: string;
  label: string;
  min: number;
  max: number | null;
  amount: number;
  count: number;
};

export type Stats = {
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: { category: string; amount: number }[];
  byMonth: { month: string; income: number; expenses: number }[];
  byMonthCategory: { month: string; category: string; amount: number }[];
  byDayCategory: { date: string; category: string; amount: number }[];
  byWeekday: { id: number; amount: number }[];
  byAmount: AmountBucket[];
  count: number;
  totalAll: number;
  excludedCount: number;
  excludedSpend: number;
  limitMonths: number;
  limits: CategoryBudget[];
};

export type RecurringPayment = {
  key: string;
  name: string;
  category: string;
  amount: number;
  months: number;
  lastDate: string;
  active: boolean;
  autoActive: boolean;
  status: RecurringStatus;
};

export type Insights = {
  payees: { name: string; category: string; amount: number; count: number; average: number }[];
  biggest: Transaction[];
  recurring: RecurringPayment[];
  daily: {
    days: number;
    average: number;
    median: number;
    spendDays: number;
    noSpendDays: number;
    weekdayAverage: number;
    weekendAverage: number;
    maxDay: { date: string; amount: number } | null;
  };
};

export type LimitStatus = "ok" | "warn" | "over";

export type CategoryBudget = {
  category: string;
  monthlyLimit: number;
  allowed: number;
  spent: number;
  remaining: number;
  ratio: number;
  status: LimitStatus;
};

export type CategoryLimitSetting = {
  category: string;
  monthlyLimit: number;
};

export type CategoryRule = {
  id: string;
  pattern: string;
  category: string;
  createdAt: string;
};

export type PeriodEvaluation = {
  scope: string;
  from: string;
  to: string;
  label: string;
  text: string;
  createdAt: string;
};

/** A written summary of one date range (a month, or custom from–to). */
export type PeriodNote = {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
};

export type AccountProvider = "" | "gocardless" | "enablebanking";

export type Account = {
  id: string;
  name: string;
  bank: string;
  iban: string;
  provider: AccountProvider;
  count: number;
  minDate: string;
  maxDate: string;
};

export type Bank = { id: string; name: string };

/**
 * Where the app runs: `local` = the server for development (npm run dev / start), `desktop` = the exe or
 * Wydatki.cmd, `web` = the static web version (data in this browser), `android` = the Play app (data on the phone).
 */
export type AppMode = "local" | "desktop" | "web" | "android";

export type AppInfo = { mode: AppMode; packaged: boolean; downloadUrl: string; showDownload: boolean };

export type DateBounds = { minDate: string; maxDate: string };

export type Meta = DateBounds & {
  total: number;
  uncategorized: number;
  excluded: number;
  categories: string[];
  limits: CategoryLimitSetting[];
  rules: CategoryRule[];
  hasAiKey: boolean;
  ai: AiPublic;
  accounts: Account[];
  banks: Bank[];
  amountThresholds: number[];
  app: AppInfo;
};

export type InsertResult = { imported: number; skipped: number; ids: string[] };

export type AiCategorizeResult = { updated: number; groups: number; remaining: number };

export type ImportResult = InsertResult &
  DateBounds & {
    total: number;
    bank: string;
    bankName: string;
    account: Account;
    accounts: Account[];
    ai: AiCategorizeResult | null;
  };

/** What `POST /import` would do with the file, without saving anything. `account.id` is "" for a new account. */
export type ImportPreview = DateBounds & {
  total: number;
  fresh: number;
  duplicates: number;
  /** New payments the rules (user + built-in) already put outside "Inne". */
  categorized: number;
  bank: string;
  bankName: string;
  account: { id: string; name: string };
};

export type DemoResult = InsertResult & DateBounds & { total: number; account: Account; accounts: Account[] };

export type TransactionsResult = DateBounds & {
  items: Transaction[];
  matched: number;
  categories: string[];
  total: number;
};
