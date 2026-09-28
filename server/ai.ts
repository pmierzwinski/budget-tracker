// OpenAI-compatible /chat/completions (JSON mode): categorizing "Inne" payments and evaluating a view.
import { DEFAULT_CATEGORY, evaluationKey, merchantPattern } from "../shared/domain.ts";
import { MONTHS_NOMINATIVE, isCalendarMonth } from "../shared/dates.ts";
import { round2 } from "../shared/numbers.ts";
import type { AiCategorizeResult, PeriodEvaluation, Transaction, TxFilters } from "../shared/types.ts";
import {
  applyCategory,
  getAccount,
  getSetting,
  getStats,
  listCategories,
  listTransactions,
  listUncategorized,
  setSetting,
  upsertPeriodEvaluation,
  upsertRule,
} from "./db/index.ts";
import { serverEnv } from "./runtime.ts";

type Assignment = { key: string; category: string };

function aiConfig() {
  const apiKey = getSetting("openai_api_key") || serverEnv("OPENAI_API_KEY");
  const baseUrl = (serverEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return { apiKey, baseUrl, model };
}

export function hasAiKey(): boolean {
  return Boolean(aiConfig().apiKey);
}

export function saveAiKey(apiKey: string): void {
  setSetting("openai_api_key", apiKey.trim());
}

async function chatJson(system: string, user: string, temperature: number): Promise<unknown> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) {
    throw new Error("Brak klucza OpenAI. Wklej go w Ustawienia → AI albo ustaw OPENAI_API_KEY w pliku .env.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
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

// ---------- Categorization ----------

function merchantKey(tx: Transaction): string {
  return merchantPattern(tx).trim();
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
  const payload = groups.map((group) => ({
    key: group.key,
    count: group.count,
    payee: group.sample.payee,
    title: group.sample.title,
    type: group.sample.type,
    amount: group.sample.amount,
  }));
  const parsed = (await chatJson(
    "Jesteś asystentem do kategoryzacji wydatków z polskiego konta bankowego. " +
      "Przypisuj kategorie wyłącznie z podanej listy. Jeśli nie jesteś pewien, użyj „Inne”. " +
      'Zwróć JSON: {"assignments":[{"key":"...","category":"..."}]}',
    `Dostępne kategorie:\n${categories.join(", ")}\n\nPłatności (pogrupowane po pośredniku):\n${JSON.stringify(payload)}`,
    0,
  )) as { assignments?: Assignment[] };
  const allowed = new Set(categories);
  return (parsed.assignments || []).filter((row) => row.key && row.category && allowed.has(row.category));
}

/** Only payments in "Inne", grouped by payee; results are saved as rules so future imports need no AI. */
export async function categorizeWithAi(ids?: string[]): Promise<AiCategorizeResult> {
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

// ---------- Period evaluation ----------

function monthLabelPl(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const name = MONTHS_NOMINATIVE[(m || 1) - 1] || month;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function viewLabel(filters: { from: string; to: string; category?: string }): string {
  let label = isCalendarMonth(filters.from, filters.to)
    ? monthLabelPl(filters.from.slice(0, 7))
    : `${filters.from} – ${filters.to}`;
  if (filters.category) label += ` · ${filters.category.replaceAll(",", ", ")}`;
  return label;
}

/**
 * 4–8 sentences in Polish about the current view (period + filters). `typed` holds the amounts exactly as
 * the user typed them — they are part of the evaluation key the frontend looks up.
 */
export async function evaluateCurrentPeriod(
  view: TxFilters,
  typed: { minAmount?: string; maxAmount?: string },
): Promise<PeriodEvaluation> {
  const from = (view.from || "").trim();
  const to = (view.to || "").trim();
  if (!from || !to) throw new Error("Podaj zakres dat.");

  const input = { ...view, category: view.category?.trim() || undefined };
  const filters: TxFilters = {
    from,
    to,
    category: input.category,
    kind: input.kind,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    account: input.account,
  };
  const periodStats = getStats({ from, to, account: input.account });
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
    "Jesteś trzeźwym komentatorem domowego budżetu w Polsce, na podstawie historii konta bankowego. " +
      "Najpierw oceń cały okres, który użytkownik ma ustawiony (sumy, kategorie, czy na plus/minus). " +
      "Potem wskaż konkretne wydatki z listy visible.transactions (nazwa + kwota), które odstają albo zjadają kasę. " +
      "Pisz po polsku, 4–8 zdań. Zero ogólników, motywacyjnego tonu i rad typu „warto oszczędzać”. " +
      "Nie wymyślaj transakcji spoza danych. Kwoty w złotych. " +
      'Zwróć JSON: {"text":"..."}',
    `Oceń ten widok:\n${JSON.stringify(payload)}`,
    0.4,
  )) as { text?: string };

  const text = String(parsed.text || "").trim();
  const accountName = input.account ? getAccount(input.account)?.name : undefined;
  if (!text) throw new Error("AI nie zwróciło oceny.");

  return upsertPeriodEvaluation({
    scope: evaluationKey({
      from,
      to,
      category: input.category,
      kind: input.kind,
      minAmount: typed.minAmount,
      maxAmount: typed.maxAmount,
      account: input.account,
    }),
    from,
    to,
    label: `${viewLabel({ from, to, category: input.category })}${accountName ? ` · ${accountName}` : ""}`,
    text,
    createdAt: new Date().toISOString(),
  });
}
