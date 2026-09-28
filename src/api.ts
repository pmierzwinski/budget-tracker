import type {
  Account,
  BankStatus,
  CategoryLimitSetting,
  CategoryRule,
  Insights,
  Institution,
  Meta,
  PeriodEvaluation,
  RecurringStatus,
  Stats,
  Transaction,
  TxFilters,
} from "./types";

let activeAccount = "";

export function setActiveAccount(id: string) {
  activeAccount = id;
}

export function getActiveAccount(): string {
  return activeAccount;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Żądanie nie powiodło się");
  return data;
}

function query(params: TxFilters = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === true) search.set(key, "1");
    else if (typeof value === "string" && value) search.set(key, value);
    else if (typeof value === "number" && Number.isFinite(value)) search.set(key, String(value));
  }
  if (activeAccount) search.set("account", activeAccount);
  return search.toString();
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
  minDate: string;
  maxDate: string;
  bank: string;
  bankName: string;
  account: Account;
  accounts: Account[];
  ai?: { updated: number; groups: number; remaining: number } | null;
};

type SyncResult = { imported: number; skipped: number; accounts: number; total: number };

export const api = {
  meta: () => request<Meta>(`/api/meta?${query()}`),
  stats: (params: TxFilters) => request<Stats>(`/api/stats?${query(params)}`),
  insights: (params: TxFilters) => request<Insights>(`/api/insights?${query(params)}`),
  setRecurringStatus: (key: string, status: RecurringStatus) =>
    request<{ ok: true }>("/api/recurring", json("PUT", { key, status })),
  transactions: (params: TxFilters) =>
    request<{ items: Transaction[]; categories: string[]; total: number; matched: number; minDate: string; maxDate: string }>(
      `/api/transactions?${query(params)}`,
    ),
  updateCategory: (id: string, category: string, options?: { onlyThis?: boolean }) =>
    request<{ ok: true; updated: number; pattern: string }>(
      `/api/transactions/${id}`,
      json("PATCH", { category, onlyThis: options?.onlyThis !== false }),
    ),
  updateComment: (id: string, comment: string) =>
    request<{ ok: true; comment: string }>(`/api/transactions/${id}`, json("PATCH", { comment })),
  setExcluded: (id: string, excluded: boolean) =>
    request<{ ok: true }>(`/api/transactions/${id}`, json("PATCH", { excluded })),
  addCategory: (name: string) => request<{ name: string; categories: string[] }>("/api/categories", json("POST", { name })),
  renameCategory: (from: string, to: string) =>
    request<{ categories: string[]; updated: number }>("/api/categories", json("PATCH", { from, to })),
  deleteCategory: (name: string) =>
    request<{ categories: string[]; updated: number }>(`/api/categories?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  setCategoryLimit: (category: string, monthlyLimit: number | null) =>
    request<{ limits: CategoryLimitSetting[]; categories: string[] }>(
      "/api/category-limits",
      json("PUT", { category, monthlyLimit }),
    ),
  rules: () => request<{ rules: CategoryRule[]; categories: string[] }>("/api/rules"),
  addRule: (pattern: string, category: string) =>
    request<{ rule: CategoryRule; updated: number }>("/api/rules", json("POST", { pattern, category })),
  deleteRule: (id: string) => request(`/api/rules/${id}`, { method: "DELETE" }),
  accounts: () => request<{ accounts: Account[] }>("/api/accounts"),
  createAccount: (input: { name: string; bank: string; iban?: string }) =>
    request<{ account: Account; accounts: Account[] }>("/api/accounts", json("POST", input)),
  updateAccount: (id: string, patch: { name?: string; iban?: string }) =>
    request<{ account: Account; accounts: Account[] }>(`/api/accounts/${id}`, json("PATCH", patch)),
  deleteAccount: (id: string) =>
    request<{ removed: number; accounts: Account[] }>(`/api/accounts/${id}`, { method: "DELETE" }),
  amountThresholds: () => request<{ thresholds: number[] }>("/api/settings/amount-buckets"),
  saveAmountThresholds: (thresholds: number[]) =>
    request<{ thresholds: number[] }>("/api/settings/amount-buckets", json("PUT", { thresholds })),
  importFile: async (
    file: File,
    options: { replaceCsv?: boolean; ai?: boolean; account?: string; bank?: string },
  ) => {
    const body = new FormData();
    body.append("file", file);
    if (options.replaceCsv) body.append("replaceCsv", "1");
    if (options.ai) body.append("ai", "1");
    if (options.account) body.append("account", options.account);
    if (options.bank) body.append("bank", options.bank);
    return request<ImportResult>("/api/import", { method: "POST", body });
  },
  importDemo: (options: { uncategorized?: boolean } = {}) =>
    request<{ imported: number; skipped: number; total: number; account: Account; accounts: Account[] }>(
      "/api/import/demo",
      json("POST", options),
    ),
  clear: (all = false) => request(`/api/data${all ? "?all=1" : ""}`, { method: "DELETE" }),
  saveAiKey: (apiKey: string) => request<{ ok: true; hasAiKey: boolean }>("/api/ai/key", json("POST", { apiKey })),
  categorizeAi: (ids?: string[]) =>
    request<{ updated: number; groups: number; remaining: number }>("/api/ai/categorize", json("POST", { ids })),
  evaluations: () => request<{ evaluations: PeriodEvaluation[]; hasAiKey: boolean }>("/api/ai/evaluations"),
  evaluatePeriod: (params: {
    from: string;
    to: string;
    category?: string;
    kind?: string;
    minAmount?: string;
    maxAmount?: string;
  }) =>
    request<{ evaluation: PeriodEvaluation; evaluations: PeriodEvaluation[]; hasAiKey: boolean }>(
      "/api/ai/evaluate",
      json("POST", { ...params, account: activeAccount || undefined }),
    ),
  bankStatus: () => request<BankStatus>("/api/bank/status"),
  gcSaveSecrets: (secretId: string, secretKey: string) =>
    request("/api/bank/gocardless/secrets", json("POST", { secretId, secretKey })),
  gcInstitutions: () => request<{ institutions: Institution[] }>("/api/bank/gocardless/institutions"),
  gcConnect: (input: { sandbox: boolean; institutionId?: string; institutionName?: string }) =>
    request<{ link: string }>("/api/bank/gocardless/connect", json("POST", input)),
  ebSaveKeys: (appId: string, privateKey: string) =>
    request("/api/bank/enablebanking/keys", json("POST", { appId, privateKey })),
  ebAspsps: () => request<{ aspsps: Institution[] }>("/api/bank/enablebanking/aspsps"),
  ebConnect: (aspsp: string) => request<{ link: string }>("/api/bank/enablebanking/connect", json("POST", { aspsp })),
  sync: (provider: "gocardless" | "enablebanking") =>
    request<SyncResult>(`/api/bank/${provider}/sync`, { method: "POST" }),
};
