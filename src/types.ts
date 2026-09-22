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
  category: string;
  comment: string;
  source: "csv" | "gocardless" | "demo";
  externalId: string;
  createdAt: string;
};

export type TxFilters = {
  from?: string;
  to?: string;
  category?: string;
  q?: string;
  minAmount?: string;
  maxAmount?: string;
  kind?: "all" | "expense" | "income";
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category_asc" | "category_desc";
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
  byWeekday: { id: number; amount: number }[];
    byAmount: { id: string; label: string; amount: number; count: number }[];
  count: number;
  totalAll: number;
  limitMonths: number;
  limits: CategoryBudget[];
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

export type Meta = {
  minDate: string;
  maxDate: string;
  total: number;
  uncategorized?: number;
  categories: string[];
  limits?: CategoryLimitSetting[];
  rules: CategoryRule[];
  hasAiKey?: boolean;
};

export type BankStatus = {
  hasSecrets: boolean;
  requisitionId: string | null;
  institutionId: string | null;
  accounts: {
    id: string;
    iban: string;
    name: string;
    currency: string;
  }[];
};
