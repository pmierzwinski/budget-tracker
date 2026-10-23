// AI with the user's own key, straight from the browser: settings, model list, categorization and period evaluation.
import { aiProvider, formatEvaluationText, isAiProvider, preferAiModel, type AiModelOption, type AiProviderId, type AiPublic } from "../../../shared/ai";
import { MONTHS_NOMINATIVE, isCalendarMonth } from "../../../shared/dates";
import { DEFAULT_CATEGORY, evaluationKey, merchantPattern } from "../../../shared/domain";
import { parseDecimal, round2 } from "../../../shared/numbers";
import type { Store } from "../../../shared/store";
import type { AiCategorizeResult, PeriodEvaluation, Transaction, TxFilters } from "../../../shared/types";
import type { Database } from "../../db";
import { listCategories, upsertRule } from "../categories/categories";
import { applyCategory, isUncategorized, listTransactions } from "../payments/transactions";
import { computeInsights, computeStats } from "../statistics/stats";
import { AiProviderFactory } from "./providers";

/** Server-side defaults from `.env` (AI_PROVIDER, OPENAI_API_KEY…); empty in the web version. */
export type AiEnv = Record<string, string>;

type AiConfig = { provider: AiProviderId; apiKey: string; model: string; baseUrl: string };

/** Gemini 2.0 models are retired; a saved one is swapped for the provider default. */
const RETIRED_GEMINI = /^gemini-2\.0/i;

/** Saved settings first, then `.env`. */
export function aiConfig(store: Store, env: AiEnv): AiConfig {
  const saved = (key: string) => store.settings[key] || "";
  const savedKey = saved("ai_api_key") || saved("openai_api_key");
  const chosen = saved("ai_provider") || env.AI_PROVIDER || "";
  const provider: AiProviderId = isAiProvider(chosen)
    ? chosen
    : !savedKey && !env.OPENAI_API_KEY && env.GEMINI_API_KEY
      ? "gemini"
      : "openai";
  const info = aiProvider(provider);
  const envKey = provider === "gemini" ? env.GEMINI_API_KEY : provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const stored = saved("ai_model") || env.AI_MODEL || (provider === "openai" ? env.OPENAI_MODEL : "") || "";
  const model = provider === "gemini" && RETIRED_GEMINI.test(stored) ? info.defaultModel : stored || info.defaultModel;
  const envUrl = provider === "openai" || provider === "compatible" ? env.OPENAI_BASE_URL : "";
  const baseUrl = (saved("ai_base_url") || envUrl || info.defaultBaseUrl).replace(/\/$/, "");
  return { provider, apiKey: savedKey || envKey || "", model, baseUrl };
}

export function aiPublic(store: Store, env: AiEnv): AiPublic {
  const { provider, model, baseUrl } = aiConfig(store, env);
  return { provider, model, baseUrl: provider === "compatible" ? baseUrl : "" };
}

export function saveAiSettings(
  draft: Store,
  env: AiEnv,
  input: { provider: string; apiKey?: string; model?: string; baseUrl?: string },
): void {
  const provider = isAiProvider(input.provider) ? input.provider : "openai";
  const info = aiProvider(provider);
  const baseUrl = (input.baseUrl || "").trim().replace(/\/$/, "");
  if (provider === "compatible" && !baseUrl) throw new Error("Podaj adres API zgodnego z OpenAI (np. http://localhost:11434/v1).");
  let model = (input.model || "").trim();
  if (provider === "gemini" && RETIRED_GEMINI.test(model)) model = info.defaultModel;
  const key = (input.apiKey || "").trim();
  draft.settings = {
    ...draft.settings,
    ai_provider: provider,
    ai_model: model || info.defaultModel,
    ai_base_url: baseUrl,
    ...(key ? { ai_api_key: key, openai_api_key: key } : {}),
  };
  if (!aiConfig(draft, env).apiKey) throw new Error("Wklej klucz API.");
}

/**
 * Models of the requested provider (key and URL from the form, else the saved ones). With the saved key a retired
 * saved model is replaced by the preferred one. "Inny" without a model list returns an empty list.
 */
export async function listAiModels(
  database: Database,
  env: AiEnv,
  input: { provider?: string; apiKey?: string; baseUrl?: string },
): Promise<{ models: AiModelOption[]; selected: string }> {
  const saved = aiConfig(database.data, env);
  const requested = input.provider || "";
  const provider: AiProviderId = isAiProvider(requested) ? requested : saved.provider;
  const apiKey = (input.apiKey || "").trim() || saved.apiKey;
  const baseUrl = ((input.baseUrl || "").trim() || (saved.provider === provider ? saved.baseUrl : "") || aiProvider(provider).defaultBaseUrl).replace(
    /\/$/,
    "",
  );
  if (!apiKey) throw new Error("Wklej klucz API, żeby pobrać listę modeli.");
  let models: AiModelOption[] = [];
  try {
    models = await AiProviderFactory.create(provider).listModels(apiKey, baseUrl);
  } catch (err) {
    if (provider === "compatible") return { models: [], selected: saved.model };
    throw err;
  }
  const selected = preferAiModel(provider, models, saved.provider === provider ? saved.model : "");
  if (selected && !input.apiKey && provider === saved.provider && selected !== database.data.settings.ai_model) {
    await database.update((draft) => {
      draft.settings = { ...draft.settings, ai_model: selected };
    });
  }
  return { models, selected };
}

async function chatJson(store: Store, env: AiEnv, system: string, user: string, temperature: number): Promise<unknown> {
  const { provider, apiKey, baseUrl, model } = aiConfig(store, env);
  if (!apiKey) throw new Error("Brak klucza AI. Wklej go w Ustawienia → AI.");
  if (!model) throw new Error("Podaj nazwę modelu.");
  return AiProviderFactory.create(provider).chat({ system, user, temperature }, { apiKey, baseUrl, model });
}

type PayeeGroup = { key: string; sample: Transaction; ids: string[] };

const CHUNK_SIZE = 60;

/** Only payments in "Inne", grouped by payee; results are saved as rules so future imports need no AI. */
export async function categorizeWithAi(database: Database, env: AiEnv, ids?: string[]): Promise<AiCategorizeResult> {
  const only = ids?.length ? new Set(ids) : null;
  const items = database.data.transactions.filter((tx) => isUncategorized(tx) && (!only || only.has(tx.id)));
  if (!items.length) return { updated: 0, groups: 0, remaining: 0 };

  const categories = listCategories(database.data);
  const groups = new Map<string, PayeeGroup>();
  for (const item of items) {
    const key = merchantPattern(item).trim() || item.id;
    const group = groups.get(key);
    if (group) group.ids.push(item.id);
    else groups.set(key, { key, sample: item, ids: [item.id] });
  }
  const list = [...groups.values()];
  let updated = 0;
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE);
    const answers = await askCategories(database.data, env, chunk, categories);
    updated += await database.update((draft) => {
      let count = 0;
      for (const group of chunk) {
        const category = answers.get(group.key);
        if (!category || category === DEFAULT_CATEGORY) continue;
        if (group.key.length >= 2) count += upsertRule(draft, group.key, category).updated;
        else for (const id of group.ids) count += applyCategory(draft, id, category, { onlyThis: true, manual: false }).updated;
      }
      return count;
    });
  }
  return { updated, groups: list.length, remaining: database.data.transactions.filter(isUncategorized).length };
}

async function askCategories(store: Store, env: AiEnv, groups: PayeeGroup[], categories: string[]): Promise<Map<string, string>> {
  const payload = groups.map((group) => ({
    key: group.key,
    count: group.ids.length,
    payee: group.sample.payee,
    title: group.sample.title,
    type: group.sample.type,
    amount: group.sample.amount,
  }));
  const parsed = (await chatJson(
    store,
    env,
    "Jesteś asystentem do kategoryzacji wydatków z polskiego konta bankowego. " +
      "Przypisuj kategorie wyłącznie z podanej listy. Jeśli nie jesteś pewien, użyj „Inne”. " +
      'Zwróć JSON: {"assignments":[{"key":"...","category":"..."}]}',
    `Dostępne kategorie:\n${categories.join(", ")}\n\nPłatności (pogrupowane po pośredniku):\n${JSON.stringify(payload)}`,
    0,
  )) as { assignments?: { key: string; category: string }[] };
  const allowed = new Set(categories);
  return new Map(
    (parsed.assignments || []).filter((row) => row.key && row.category && allowed.has(row.category)).map((row) => [row.key, row.category]),
  );
}

const WEEKDAY_NAMES = ["nd", "pn", "wt", "śr", "cz", "pt", "so"];

const EVALUATION_PROMPT =
  "Jesteś trzeźwym komentatorem domowego budżetu w Polsce, na podstawie historii konta bankowego. " +
  "Odpowiedz na cztery pytania. Każde 1–3 zdania, po polsku, z konkretnymi nazwami i kwotami z danych. " +
  "Nie wymyślaj transakcji spoza danych. Kwoty w złotych. " +
  "Zero motywacyjnego tonu i ogólników typu „warto oszczędzać” albo „trzeba się ograniczyć”. " +
  "1) main — główny wydatek okresu: największa kategoria albo pojedyncza płatność, która zjadła kasę. " +
  "2) flexible — na co poza stałymi, trudnymi do ominięcia płatnościami (rachunki, czynsz, mieszkanie, kredyt) poszło najwięcej. " +
  "3) save — co w tym okresie dałoby się realnie uciąć albo zmienić, żeby zostało więcej; wskaż konkretne pozycje, nie ogólne rady. " +
  "4) hidden — ogólna ocena tego, czego nie widać na pierwszy rzut oka: drobne płatności, które się sumują, weekend kontra tydzień, jeden odbiorca, dziura w „Inne”, jednoraz kontra stałe. " +
  'Zwróć JSON: {"main":"...","flexible":"...","save":"...","hidden":"..."}';

export type EvaluationView = { from: string; to: string; category?: string; kind?: string; minAmount?: string; maxAmount?: string };

/** Four short Polish answers about the current view (period + filters), saved per view. */
export async function evaluatePeriod(database: Database, env: AiEnv, view: EvaluationView, account: string): Promise<PeriodEvaluation> {
  const store = database.data;
  const from = view.from.trim();
  const to = view.to.trim();
  if (!from || !to) throw new Error("Podaj zakres dat.");
  const category = view.category?.trim() || undefined;
  const kind = view.kind === "expense" || view.kind === "income" ? view.kind : "all";
  const filters: TxFilters = {
    from,
    to,
    category,
    kind,
    minAmount: parseDecimal(view.minAmount),
    maxAmount: parseDecimal(view.maxAmount),
    account: account || undefined,
  };
  const period = computeStats(store, { from, to, account: filters.account });
  if (!period.count) throw new Error("Brak transakcji w tym okresie.");
  const listed = listTransactions(store, { ...filters, kind: kind === "income" ? "income" : "expense", sort: "amount_desc" }, 30);
  if (!listed.matched && (category || filters.minAmount != null || filters.maxAmount != null)) throw new Error("Brak wydatków w tym widoku.");
  const insights = computeInsights(store, { from, to, account: filters.account });

  const payload = {
    period: {
      from,
      to,
      income: round2(period.income),
      expenses: round2(period.expenses),
      net: round2(period.net),
      count: period.count,
      categories: period.byCategory
        .filter((row) => row.amount < 0)
        .slice(0, 12)
        .map((row) => ({ category: row.category, spent: round2(-row.amount) })),
      months: period.byMonth.map((row) => ({
        month: row.month,
        income: round2(row.income),
        expenses: round2(row.expenses),
        net: round2(row.income - row.expenses),
      })),
    },
    fixedHint: "Za stałe / trudne do ominięcia uważaj m.in. Rachunki, Mieszkanie oraz przelewy wyglądające na czynsz, kredyt albo ubezpieczenie.",
    topPayees: insights.payees.slice(0, 8).map((row) => ({ name: row.name, category: row.category, spent: round2(row.amount), count: row.count })),
    daily: {
      average: round2(insights.daily.average),
      weekdayAverage: round2(insights.daily.weekdayAverage),
      weekendAverage: round2(insights.daily.weekendAverage),
      maxDay: insights.daily.maxDay ? { date: insights.daily.maxDay.date, spent: round2(insights.daily.maxDay.amount) } : null,
      noSpendDays: insights.daily.noSpendDays,
    },
    weekdays: period.byWeekday
      .filter((row) => row.amount > 0.004)
      .map((row) => ({ day: WEEKDAY_NAMES[row.id] || String(row.id), spent: round2(row.amount) })),
    recurring: insights.recurring
      .filter((row) => row.status !== "hidden")
      .slice(0, 8)
      .map((row) => ({ name: row.name, category: row.category, typical: round2(row.amount), months: row.months, status: row.status })),
    visible: {
      category: category || null,
      kind: kind !== "all" ? kind : "expense",
      minAmount: filters.minAmount ?? null,
      maxAmount: filters.maxAmount ?? null,
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

  const parsed = (await chatJson(store, env, EVALUATION_PROMPT, `Oceń ten widok:\n${JSON.stringify(payload)}`, 0.4)) as Record<string, string>;
  const text = formatEvaluationText(parsed) || String(parsed.text || "").trim();
  if (!text) throw new Error("AI nie zwróciło oceny.");
  const accountName = account ? store.accounts.find((row) => row.id === account)?.name : undefined;
  const evaluation: PeriodEvaluation = {
    scope: evaluationKey({ ...view, from, to, category, account }),
    from,
    to,
    label: `${viewLabel(from, to, category)}${accountName ? ` · ${accountName}` : ""}`,
    text,
    createdAt: new Date().toISOString(),
  };
  await database.update((draft) => {
    draft.evaluations = [...draft.evaluations.filter((row) => row.scope !== evaluation.scope), evaluation];
  });
  return evaluation;
}

function viewLabel(from: string, to: string, category?: string): string {
  const [year, month] = from.split("-").map(Number);
  const name = MONTHS_NOMINATIVE[(month || 1) - 1] || from;
  let label = isCalendarMonth(from, to) ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}` : `${from} – ${to}`;
  if (category) label += ` · ${category.replaceAll(",", ", ")}`;
  return label;
}
