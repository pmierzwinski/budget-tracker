// Chat completions in JSON mode: categorizing "Inne" payments and evaluating a view.
import {
  aiProvider,
  formatEvaluationText,
  isAiProvider,
  preferAiModel,
  type AiModelOption,
  type AiProviderId,
  type AiPublic,
  type EvaluationParts,
} from "../../../shared/ai.ts";
import { DEFAULT_CATEGORY, evaluationKey, merchantPattern } from "../../../shared/domain.ts";
import { MONTHS_NOMINATIVE, isCalendarMonth } from "../../../shared/dates.ts";
import { round2 } from "../../../shared/numbers.ts";
import type { AiCategorizeResult, PeriodEvaluation, Transaction, TxFilters } from "../../../shared/types.ts";
import {
  applyCategory,
  getAccount,
  getInsights,
  getSetting,
  getStats,
  listCategories,
  listTransactions,
  listUncategorized,
  setSetting,
  upsertPeriodEvaluation,
  upsertRule,
} from "../../db/index.ts";
import { serverEnv } from "../../runtime.ts";

type Assignment = { key: string; category: string };

function envKey(provider: AiProviderId): string {
  if (provider === "gemini") return serverEnv("GEMINI_API_KEY");
  if (provider === "anthropic") return serverEnv("ANTHROPIC_API_KEY");
  return serverEnv("OPENAI_API_KEY");
}

function resolveProvider(): AiProviderId {
  const saved = getSetting("ai_provider") || serverEnv("AI_PROVIDER");
  if (isAiProvider(saved)) return saved;
  if (!getSetting("ai_api_key") && !getSetting("openai_api_key") && !serverEnv("OPENAI_API_KEY") && serverEnv("GEMINI_API_KEY")) {
    return "gemini";
  }
  return "openai";
}

function aiConfig() {
  const provider = resolveProvider();
  const info = aiProvider(provider);
  const apiKey = getSetting("ai_api_key") || getSetting("openai_api_key") || envKey(provider);
  const stored =
    getSetting("ai_model") ||
    serverEnv("AI_MODEL") ||
    (provider === "openai" ? serverEnv("OPENAI_MODEL") : "");
  const model = provider === "gemini" && /^gemini-2\.0/i.test(stored) ? info.defaultModel : stored || info.defaultModel;
  const baseUrl = (
    getSetting("ai_base_url") ||
    (provider === "openai" || provider === "compatible" ? serverEnv("OPENAI_BASE_URL") : "") ||
    info.defaultBaseUrl
  ).replace(/\/$/, "");
  return { provider, apiKey, model, baseUrl };
}

export function hasAiKey(): boolean {
  return Boolean(aiConfig().apiKey);
}

export function aiPublic(): AiPublic {
  const { provider, model, baseUrl } = aiConfig();
  return { provider, model, baseUrl: provider === "compatible" ? baseUrl : "" };
}

export function saveAiSettings(input: { provider: string; apiKey?: string; model?: string; baseUrl?: string }): void {
  const provider = isAiProvider(input.provider) ? input.provider : "openai";
  const info = aiProvider(provider);
  const baseUrl = (input.baseUrl || "").trim().replace(/\/$/, "");
  if (provider === "compatible" && !baseUrl) {
    throw new Error("Podaj adres API zgodnego z OpenAI (np. http://localhost:11434/v1).");
  }
  let model = (input.model || "").trim();
  if (provider === "gemini" && /^gemini-2\.0/i.test(model)) model = info.defaultModel;
  setSetting("ai_provider", provider);
  setSetting("ai_model", model || info.defaultModel);
  setSetting("ai_base_url", baseUrl);
  const key = (input.apiKey || "").trim();
  if (key) {
    setSetting("ai_api_key", key);
    setSetting("openai_api_key", key);
  }
  if (!hasAiKey()) throw new Error("Wklej klucz API.");
}

export function saveAiKey(apiKey: string): void {
  saveAiSettings({ provider: resolveProvider(), apiKey });
}

function sortModels(models: AiModelOption[]): AiModelOption[] {
  return [...models].sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id.localeCompare(b.id));
}

async function listOpenAiModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
  if (!baseUrl) throw new Error("Brak adresu API.");
  const response = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = (await response.json()) as { error?: { message?: string }; data?: { id?: string }[] };
  if (!response.ok) throw new Error(apiError(data, `AI ${response.status}`));
  return sortModels(
    (data.data || [])
      .map((row) => String(row.id || "").trim())
      .filter((id) => /^(gpt-|o[1-4]-|chatgpt-)/i.test(id) && !/realtime|audio|transcribe|tts|image|instruct|search/i.test(id))
      .map((id) => ({ id, name: id })),
  );
}

async function listGeminiModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
  const root = baseUrl || aiProvider("gemini").defaultBaseUrl;
  const models: AiModelOption[] = [];
  let pageToken = "";
  for (let i = 0; i < 6; i += 1) {
    const url = new URL(`${root}/models`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    const data = (await response.json()) as {
      error?: { message?: string };
      nextPageToken?: string;
      models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    if (!response.ok) throw new Error(apiError(data, `Gemini ${response.status}`));
    for (const row of data.models || []) {
      const methods = row.supportedGenerationMethods || [];
      if (!methods.includes("generateContent")) continue;
      const id = geminiModelId(String(row.name || ""));
      if (
        !id ||
        /^gemini-2\.0/i.test(id) ||
        /embedding|imagen|image|veo|tts|aqa|computer-use|lyria|transcribe|robotics|antigravity|deep-research|nano-banana/i.test(id)
      ) {
        continue;
      }
      models.push({ id, name: row.displayName || id });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  return sortModels(models);
}

async function listAnthropicModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
  const root = baseUrl || aiProvider("anthropic").defaultBaseUrl;
  const response = await fetch(`${root}/models?limit=100`, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    data?: { id?: string; display_name?: string }[];
  };
  if (!response.ok) throw new Error(apiError(data, `Claude ${response.status}`));
  return sortModels(
    (data.data || [])
      .map((row) => ({ id: String(row.id || "").trim(), name: row.display_name || String(row.id || "") }))
      .filter((row) => row.id),
  );
}

export async function listAiModels(input: { provider?: string; apiKey?: string; baseUrl?: string } = {}): Promise<{
  models: AiModelOption[];
  selected: string;
}> {
  const saved = aiConfig();
  const requested = input.provider || "";
  const provider: AiProviderId = isAiProvider(requested) ? requested : saved.provider;
  const apiKey = (input.apiKey || "").trim() || saved.apiKey;
  const baseUrl = (
    (input.baseUrl || "").trim() ||
    (saved.provider === provider ? saved.baseUrl : "") ||
    aiProvider(provider).defaultBaseUrl
  ).replace(/\/$/, "");
  if (!apiKey) throw new Error("Wklej klucz API, żeby pobrać listę modeli.");
  let models: AiModelOption[] = [];
  try {
    if (provider === "gemini") models = await listGeminiModels(apiKey, baseUrl);
    else if (provider === "anthropic") models = await listAnthropicModels(apiKey, baseUrl);
    else models = await listOpenAiModels(apiKey, baseUrl);
  } catch (err) {
    if (provider === "compatible") return { models: [], selected: saved.model };
    throw err;
  }
  const selected = preferAiModel(provider, models, saved.provider === provider ? saved.model : "");
  if (selected && !input.apiKey && provider === saved.provider && selected !== getSetting("ai_model")) {
    setSetting("ai_model", selected);
  }
  return { models, selected };
}

function parseModelJson(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed || "{}") as unknown;
  } catch {
    throw new Error("AI zwróciło niepoprawną odpowiedź.");
  }
}

function apiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const err = (data as { error?: { message?: string } | string }).error;
    if (typeof err === "string" && err.trim()) return err;
    if (err && typeof err === "object" && err.message) return err.message;
  }
  return fallback;
}

async function chatOpenAi(system: string, user: string, temperature: number, apiKey: string, baseUrl: string, model: string) {
  if (!baseUrl) throw new Error("Brak adresu API.");
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
  const data = (await response.json()) as { error?: { message?: string }; choices?: { message?: { content?: string } }[] };
  if (!response.ok) throw new Error(apiError(data, `AI ${response.status}`));
  return parseModelJson(data.choices?.[0]?.message?.content || "{}");
}

function geminiModelId(model: string): string {
  return model.replace(/^models\//, "");
}

async function chatGemini(system: string, user: string, temperature: number, apiKey: string, baseUrl: string, model: string) {
  const root = baseUrl || aiProvider("gemini").defaultBaseUrl;
  const id = geminiModelId(model);
  const response = await fetch(`${root}/models/${encodeURIComponent(id)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (!response.ok) throw new Error(apiError(data, `Gemini ${response.status}`));
  return parseModelJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}");
}

async function chatAnthropic(system: string, user: string, temperature: number, apiKey: string, baseUrl: string, model: string) {
  const root = baseUrl || aiProvider("anthropic").defaultBaseUrl;
  const response = await fetch(`${root}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    content?: { type?: string; text?: string }[];
  };
  if (!response.ok) throw new Error(apiError(data, `Claude ${response.status}`));
  const text = (data.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("");
  return parseModelJson(text || "{}");
}

async function chatJson(system: string, user: string, temperature: number): Promise<unknown> {
  const { provider, apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) {
    throw new Error("Brak klucza AI. Wklej go w Ustawienia → AI.");
  }
  if (!model) throw new Error("Podaj nazwę modelu.");
  if (provider === "gemini") return chatGemini(system, user, temperature, apiKey, baseUrl, model);
  if (provider === "anthropic") return chatAnthropic(system, user, temperature, apiKey, baseUrl, model);
  return chatOpenAi(system, user, temperature, apiKey, baseUrl, model);
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
          updated += applyCategory(id, category, { onlyThis: true, manual: false }).updated;
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
 * Four short Polish answers about the current view (period + filters). `typed` holds the amounts exactly as
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
    limit: 30,
  });
  if (!listed.matched && (filters.category || filters.minAmount != null || filters.maxAmount != null)) {
    throw new Error("Brak wydatków w tym widoku.");
  }

  const insights = getInsights({ from, to, account: input.account });
  const weekdayNames = ["nd", "pn", "wt", "śr", "cz", "pt", "so"];
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
    fixedHint:
      "Za stałe / trudne do ominięcia uważaj m.in. Rachunki, Mieszkanie oraz przelewy wyglądające na czynsz, kredyt albo ubezpieczenie.",
    topPayees: insights.payees.slice(0, 8).map((row) => ({
      name: row.name,
      category: row.category,
      spent: round2(row.amount),
      count: row.count,
    })),
    daily: {
      average: round2(insights.daily.average),
      weekdayAverage: round2(insights.daily.weekdayAverage),
      weekendAverage: round2(insights.daily.weekendAverage),
      maxDay: insights.daily.maxDay
        ? { date: insights.daily.maxDay.date, spent: round2(insights.daily.maxDay.amount) }
        : null,
      noSpendDays: insights.daily.noSpendDays,
    },
    weekdays: periodStats.byWeekday
      .filter((row) => row.amount > 0.004)
      .map((row) => ({ day: weekdayNames[row.id] || String(row.id), spent: round2(row.amount) })),
    recurring: insights.recurring
      .filter((row) => row.status !== "hidden")
      .slice(0, 8)
      .map((row) => ({
        name: row.name,
        category: row.category,
        typical: round2(row.amount),
        months: row.months,
        status: row.status,
      })),
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
      "Odpowiedz na cztery pytania. Każde 1–3 zdania, po polsku, z konkretnymi nazwami i kwotami z danych. " +
      "Nie wymyślaj transakcji spoza danych. Kwoty w złotych. " +
      "Zero motywacyjnego tonu i ogólników typu „warto oszczędzać” albo „trzeba się ograniczyć”. " +
      "1) main — główny wydatek okresu: największa kategoria albo pojedyncza płatność, która zjadła kasę. " +
      "2) flexible — na co poza stałymi, trudnymi do ominięcia płatnościami (rachunki, czynsz, mieszkanie, kredyt) poszło najwięcej. " +
      "3) save — co w tym okresie dałoby się realnie uciąć albo zmienić, żeby zostało więcej; wskaż konkretne pozycje, nie ogólne rady. " +
      "4) hidden — ogólna ocena tego, czego nie widać na pierwszy rzut oka: drobne płatności, które się sumują, weekend kontra tydzień, jeden odbiorca, dziura w „Inne”, jednoraz kontra stałe. " +
      'Zwróć JSON: {"main":"...","flexible":"...","save":"...","hidden":"..."}',
    `Oceń ten widok:\n${JSON.stringify(payload)}`,
    0.4,
  )) as EvaluationParts & { text?: string };

  const text = formatEvaluationText(parsed) || String(parsed.text || "").trim();
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
