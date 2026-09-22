import type {
  BankStatus,
  CategoryLimitSetting,
  CategoryRule,
  Meta,
  PeriodEvaluation,
  Stats,
  Transaction,
  TxFilters,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Żądanie nie powiodło się");
  return data;
}

function query(params: TxFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return search.toString();
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  stats: (params: TxFilters) => request<Stats>(`/api/stats?${query(params)}`),
  transactions: (params: TxFilters) =>
    request<{ items: Transaction[]; categories: string[]; total: number; matched: number; minDate: string; maxDate: string }>(
      `/api/transactions?${query(params)}`,
    ),
  updateCategory: (id: string, category: string, options?: { onlyThis?: boolean }) =>
    request<{ ok: true; updated: number; pattern: string }>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        onlyThis: options?.onlyThis !== false,
      }),
    }),
  updateComment: (id: string, comment: string) =>
    request<{ ok: true; comment: string }>(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    }),
  addCategory: (name: string) =>
    request<{ name: string; categories: string[] }>("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  renameCategory: (from: string, to: string) =>
    request<{ categories: string[]; updated: number }>("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    }),
  deleteCategory: (name: string) =>
    request<{ categories: string[]; updated: number }>(`/api/categories?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  setCategoryLimit: (category: string, monthlyLimit: number | null) =>
    request<{ limits: CategoryLimitSetting[]; categories: string[] }>("/api/category-limits", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, monthlyLimit }),
    }),
  rules: () => request<{ rules: CategoryRule[]; categories: string[] }>("/api/rules"),
  addRule: (pattern: string, category: string) =>
    request<{ rule: CategoryRule; updated: number }>("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, category }),
    }),
  deleteRule: (id: string) => request(`/api/rules/${id}`, { method: "DELETE" }),
  importFile: async (file: File, options?: { replaceCsv?: boolean; ai?: boolean }) => {
    const body = new FormData();
    body.append("file", file);
    if (options?.replaceCsv) body.append("replaceCsv", "1");
    if (options?.ai) body.append("ai", "1");
    return request<{
      imported: number;
      skipped: number;
      total: number;
      minDate: string;
      maxDate: string;
      ai?: { updated: number; groups: number; remaining: number } | null;
    }>("/api/import", { method: "POST", body });
  },
  importDemo: () =>
    request<{ imported: number; skipped: number; total: number }>("/api/import/demo", {
      method: "POST",
    }),
  clear: (all = false) => request(`/api/data${all ? "?all=1" : ""}`, { method: "DELETE" }),
  saveAiKey: (apiKey: string) =>
    request<{ ok: true; hasAiKey: boolean }>("/api/ai/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }),
  categorizeAi: (ids?: string[]) =>
    request<{ updated: number; groups: number; remaining: number }>("/api/ai/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),
  evaluations: () =>
    request<{ evaluations: PeriodEvaluation[]; hasAiKey: boolean }>("/api/ai/evaluations"),
  evaluatePeriod: (params: {
    from: string;
    to: string;
    category?: string;
    kind?: string;
    minAmount?: string;
    maxAmount?: string;
  }) =>
    request<{ evaluation: PeriodEvaluation; evaluations: PeriodEvaluation[]; hasAiKey: boolean }>("/api/ai/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
  bankStatus: () => request<BankStatus>("/api/bank/status"),
  saveSecrets: (secretId: string, secretKey: string) =>
    request("/api/bank/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secretId, secretKey }),
    }),
  connect: (sandbox: boolean) =>
    request<{ link: string; requisitionId: string }>("/api/bank/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandbox }),
    }),
  sync: () =>
    request<{ imported: number; skipped: number; accounts: number; total: number }>("/api/bank/sync", {
      method: "POST",
    }),
};
