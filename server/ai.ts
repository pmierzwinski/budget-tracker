import { DEFAULT_CATEGORY, suggestPattern } from "./categorize.ts";
import {
  applyCategory,
  getSetting,
  getStats,
  listCategories,
  listTransactions,
  listUncategorized,
  upsertPeriodEvaluation,
  upsertRule,
} from "./db.ts";
import type { PeriodEvaluation, Transaction, TxFilters } from "./types.ts";

type Assignment = { key: string; category: string };

function aiConfig() {
  const apiKey = getSetting("openai_api_key") || process.env.OPENAI_API_KEY || "";
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

export function hasAiKey(): boolean {
  return Boolean(aiConfig().apiKey);
}

function merchantKey(tx: Transaction): string {
  return suggestPattern(tx.payee || tx.title || tx.type).trim();
}

function groupsFrom(items: Transaction[]): { key: string; sample: Transaction; count: number; ids: string[] }[] {
  const map = new Map<string, { sample: Transaction; ids: string[] }>();
  for (const item of items) {
    const key = merchantKey(item) || item.id;
    const current = map.get(key);
    if (current) current.ids.push(item.id);
    else map.set(key, { sample: item, ids: [item.id] });
  }
  return [...map.entries()].map(([key, value]) => ({
    key,
    sample: value.sample,
    count: value.ids.length,
    ids: value.ids,
  }));
}

async function askModel(
  groups: { key: string; sample: Transaction; count: number }[],
  categories: string[],
): Promise<Assignment[]> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) {
    throw new Error("Brak klucza OpenAI. Wklej go w Kategorie albo ustaw OPENAI_API_KEY w pliku .env.");
  }

  const payload = groups.map((group) => ({
    key: group.key,
    count: group.count,
    payee: group.sample.payee,
    title: group.sample.title,
    type: group.sample.type,
    amount: group.sample.amount,
  }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Jesteś asystentem do kategoryzacji wydatków z polskiego banku PKO. " +
            "Przypisuj kategorie wyłącznie z podanej listy. Jeśli nie jesteś pewien, użyj „Inne”. " +
            'Zwróć JSON: {"assignments":[{"key":"...","category":"..."}]}',
        },
        {
          role: "user",
          content: `Dostępne kategorie:\n${categories.join(", ")}\n\nPłatności (pogrupowane po pośredniku):\n${JSON.stringify(payload)}`,
        },
      ],
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI ${response.status}`);
  }

  const raw = data.choices?.[0]?.message?.content || "{}";
  let parsed: { assignments?: Assignment[] };
  try {
    parsed = JSON.parse(raw) as { assignments?: Assignment[] };
  } catch {
    throw new Error("AI zwróciło niepoprawną odpowiedź.");
  }
  const allowed = new Set(categories);
  return (parsed.assignments || []).filter(
    (row) => row.key && row.category && allowed.has(row.category),
  );
}

export async function categorizeWithAi(ids?: string[]): Promise<{
  updated: number;
  groups: number;
  remaining: number;
}> {
  const items = listUncategorized(ids);
  if (!items.length) {
    return { updated: 0, groups: 0, remaining: 0 };
  }

  const categories = listCategories();
  const groups = groupsFrom(items);
  const chunkSize = 60;
  let updated = 0;

  for (let i = 0; i < groups.length; i += chunkSize) {
    const chunk = groups.slice(i, i + chunkSize);
    const assignments = await askModel(chunk, categories);
    const byKey = new Map(assignments.map((row) => [row.key, row.category]));
    for (const group of chunk) {
      const category = byKey.get(group.key);
      if (!category || category === DEFAULT_CATEGORY) continue;
      if (group.key.length >= 2) {
        updated += upsertRule(group.key, category).updated;
      } else {
        for (const id of group.ids) {
          updated += applyCategory(id, category, { onlyThis: true }).updated;
        }
      }
    }
  }

  return {
    updated,
    groups: groups.length,
    remaining: listUncategorized().length,
  };
}

const PL_MONTHS = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthLabelPl(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const name = PL_MONTHS[(m || 1) - 1] || month;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function isCalendarMonth(from: string, to: string): boolean {
  if (!from || !to || from.slice(0, 7) !== to.slice(0, 7) || from.slice(8) !== "01") return false;
  const [year, month] = from.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return to === `${from.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

export function evaluationKey(filters: {
  from?: string;
  to?: string;
  category?: string;
  kind?: string;
  minAmount?: string;
  maxAmount?: string;
}): string {
  return [
    filters.from || "",
    filters.to || "",
    filters.category || "",
    filters.kind && filters.kind !== "all" ? filters.kind : "",
    filters.minAmount || "",
    filters.maxAmount || "",
  ].join("|");
}

function viewLabel(filters: { from: string; to: string; category?: string }): string {
  let label = isCalendarMonth(filters.from, filters.to)
    ? monthLabelPl(filters.from.slice(0, 7))
    : `${filters.from} – ${filters.to}`;
  if (filters.category) label += ` · ${filters.category.replaceAll(",", ", ")}`;
  return label;
}

async function chatJson(system: string, user: string): Promise<unknown> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) {
    throw new Error("Brak klucza OpenAI. Wklej go w Kategorie albo ustaw OPENAI_API_KEY w pliku .env.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI ${response.status}`);
  }

  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("AI zwróciło niepoprawną odpowiedź.");
  }
}

export async function evaluateCurrentPeriod(input: {
  from: string;
  to: string;
  category?: string;
  kind?: TxFilters["kind"];
  minAmount?: number;
  maxAmount?: number;
  minAmountRaw?: string;
  maxAmountRaw?: string;
}): Promise<PeriodEvaluation> {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to) throw new Error("Podaj zakres dat.");

  const filters: TxFilters = {
    from,
    to,
    category: input.category || undefined,
    kind: input.kind,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
  };
  const periodStats = getStats({ from, to });
  if (!periodStats.count) throw new Error("Brak transakcji w tym okresie.");

  const listed = listTransactions({
    ...filters,
    kind: filters.kind === "income" ? "income" : "expense",
    sort: "amount_desc",
    limit: 60,
  });
  if (!listed.matched && (filters.category || filters.minAmount != null || filters.maxAmount != null)) {
    throw new Error("Brak wydatków w tym widoku.");
  }

  const payload = {
    period: {
      from,
      to,
      income: round2(periodStats.income),
      expenses: round2(periodStats.expenses),
      net: round2(periodStats.net),
      count: periodStats.count,
      categories: periodStats.byCategory
        .filter((row) => row.amount < 0)
        .slice(0, 12)
        .map((row) => ({ category: row.category, spent: round2(-row.amount) })),
      months: periodStats.byMonth.map((row) => ({
        month: row.month,
        income: round2(row.income),
        expenses: round2(row.expenses),
        net: round2(row.income - row.expenses),
      })),
    },
    visible: {
      category: input.category || null,
      kind: input.kind && input.kind !== "all" ? input.kind : "expense",
      minAmount: input.minAmount ?? null,
      maxAmount: input.maxAmount ?? null,
      transactions: listed.items.map((tx) => ({
        date: tx.date,
        payee: (tx.payee || tx.title || tx.type).slice(0, 70),
        title: tx.title.slice(0, 80),
        amount: round2(tx.amount),
        category: tx.category,
        comment: tx.comment || undefined,
      })),
      moreTransactions: Math.max(0, listed.matched - listed.items.length),
    },
  };

  const parsed = (await chatJson(
    "Jesteś trzeźwym komentatorem domowego budżetu w Polsce, na podstawie historii z PKO. " +
      "Najpierw oceń cały okres, który użytkownik ma ustawiony (sumy, kategorie, czy na plus/minus). " +
      "Potem wskaż konkretne wydatki z listy visible.transactions (nazwa + kwota), które odstają albo zjadają kasę. " +
      "Pisz po polsku, 4–8 zdań. Zero ogólników, motywacyjnego tonu i rad typu „warto oszczędzać”. " +
      "Nie wymyślaj transakcji spoza danych. Kwoty w złotych. " +
      'Zwróć JSON: {"text":"..."}',
    `Oceń ten widok:\n${JSON.stringify(payload)}`,
  )) as { text?: string };

  const text = String(parsed.text || "").trim();
  if (!text) throw new Error("AI nie zwróciło oceny.");

  return upsertPeriodEvaluation({
    scope: evaluationKey({
      from,
      to,
      category: input.category,
      kind: input.kind,
      minAmount: input.minAmountRaw,
      maxAmount: input.maxAmountRaw,
    }),
    from,
    to,
    label: viewLabel({ from, to, category: input.category }),
    text,
    createdAt: new Date().toISOString(),
  });
}
