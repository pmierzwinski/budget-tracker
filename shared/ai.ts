export const AI_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    keyHint: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "gemini",
    label: "Gemini",
    keyHint: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "aistudio.google.com/apikey",
    defaultModel: "gemini-3.8-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    id: "anthropic",
    label: "Claude",
    keyHint: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "console.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    defaultBaseUrl: "https://api.anthropic.com/v1",
  },
  {
    id: "compatible",
    label: "Inny",
    keyHint: "klucz API",
    docsUrl: "",
    docsLabel: "",
    defaultModel: "",
    defaultBaseUrl: "",
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

export type AiPublic = {
  provider: AiProviderId;
  model: string;
  baseUrl: string;
};

export function isAiProvider(id: string): id is AiProviderId {
  return AI_PROVIDERS.some((item) => item.id === id);
}

export function aiProvider(id: string): (typeof AI_PROVIDERS)[number] {
  return AI_PROVIDERS.find((item) => item.id === id) || AI_PROVIDERS[0];
}

export type AiModelOption = { id: string; name: string };

/** Picks a usable model from a live list; keeps `current` when it is still offered. */
export function preferAiModel(provider: AiProviderId, models: readonly AiModelOption[], current: string): string {
  const ids = models.map((item) => item.id);
  if (current && ids.includes(current)) return current;
  const hints: Record<AiProviderId, string[]> = {
    gemini: ["gemini-3.8-flash", "gemini-3-flash", "gemini-2.5-flash", "gemini-flash-latest"],
    openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"],
    anthropic: ["claude-sonnet-4-5", "claude-sonnet-4-0"],
    compatible: [],
  };
  for (const id of hints[provider]) {
    if (ids.includes(id)) return id;
  }
  if (provider === "gemini") {
    const flash = ids.find((id) => /flash/i.test(id) && !/lite|exp|image|tts/i.test(id));
    if (flash) return flash;
  }
  return ids[0] || current || aiProvider(provider).defaultModel;
}

export const EVALUATION_SECTIONS = [
  { id: "main", title: "Główny wydatek" },
  { id: "flexible", title: "Poza stałymi" },
  { id: "save", title: "Gdzie uciąć" },
  { id: "hidden", title: "Czego nie widać" },
] as const;

export type EvaluationSectionId = (typeof EVALUATION_SECTIONS)[number]["id"];
export type EvaluationParts = Partial<Record<EvaluationSectionId, string>>;

export function formatEvaluationText(parts: EvaluationParts): string {
  return EVALUATION_SECTIONS.map((section) => {
    const body = (parts[section.id] || "").trim();
    return body ? `${section.title}\n${body}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

export function parseEvaluationText(text: string): { title: string; body: string }[] {
  const raw = text.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const titles = new Set<string>(EVALUATION_SECTIONS.map((section) => section.title));
  const sections: { title: string; body: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of raw.split("\n")) {
    const heading = line.trim();
    if (titles.has(heading)) {
      if (current) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      current = { title: heading, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  const filled = sections.filter((section) => section.body);
  return filled.length >= 2 ? filled : [{ title: "", body: raw }];
}
