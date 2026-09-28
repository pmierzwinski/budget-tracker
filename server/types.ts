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
  source: "csv" | "gocardless" | "enablebanking" | "demo";
  externalId: string;
  createdAt: string;
};

export type TxFilters = {
  from?: string;
  to?: string;
  category?: string;
  q?: string;
  minAmount?: number;
  maxAmount?: number;
  kind?: "all" | "expense" | "income";
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category_asc" | "category_desc";
  account?: string;
  includeExcluded?: boolean;
  excludedOnly?: boolean;
  weekday?: number;
  limit?: number;
};

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

export type Insights = {
  payees: { name: string; category: string; amount: number; count: number; average: number }[];
  biggest: Transaction[];
  recurring: {
    key: string;
    name: string;
    category: string;
    amount: number;
    months: number;
    lastDate: string;
    active: boolean;
    autoActive: boolean;
    status: RecurringStatus;
  }[];
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

export type CategoryBudget = {
  category: string;
  monthlyLimit: number;
  allowed: number;
  spent: number;
  remaining: number;
  ratio: number;
  status: "ok" | "warn" | "over";
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

export type Account = {
  id: string;
  name: string;
  bank: string;
  iban: string;
  provider: "" | "gocardless" | "enablebanking";
  count: number;
  minDate: string;
  maxDate: string;
};
