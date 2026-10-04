// Which AI provider, key, model and base URL to use: saved settings first, then .env (ignored online).
import { aiProvider, isAiProvider, type AiProviderId, type AiPublic } from "../shared/ai.ts";
import type { Runtime } from "../core/Runtime.ts";
import type { SettingsRepository } from "../settings/SettingsRepository.ts";

export type AiConfig = { provider: AiProviderId; apiKey: string; model: string; baseUrl: string };

export type AiSettingsInput = { provider: string; apiKey?: string; model?: string; baseUrl?: string };

/** Gemini 2.0 models are retired; a saved one is swapped for the provider default. */
const RETIRED_GEMINI = /^gemini-2\.0/i;

export class AiSettings {
  readonly #settings: SettingsRepository;
  readonly #runtime: Runtime;

  constructor(settings: SettingsRepository, runtime: Runtime) {
    this.#settings = settings;
    this.#runtime = runtime;
  }

  config(): AiConfig {
    const provider = this.#provider();
    const info = aiProvider(provider);
    const apiKey = this.#settings.get("ai_api_key") || this.#settings.get("openai_api_key") || this.#envKey(provider);
    const stored =
      this.#settings.get("ai_model") ||
      this.#runtime.env("AI_MODEL") ||
      (provider === "openai" ? this.#runtime.env("OPENAI_MODEL") : "");
    const model = provider === "gemini" && RETIRED_GEMINI.test(stored) ? info.defaultModel : stored || info.defaultModel;
    const baseUrl = (
      this.#settings.get("ai_base_url") ||
      (provider === "openai" || provider === "compatible" ? this.#runtime.env("OPENAI_BASE_URL") : "") ||
      info.defaultBaseUrl
    ).replace(/\/$/, "");
    return { provider, apiKey, model, baseUrl };
  }

  hasKey(): boolean {
    return Boolean(this.config().apiKey);
  }

  publicInfo(): AiPublic {
    const { provider, model, baseUrl } = this.config();
    return { provider, model, baseUrl: provider === "compatible" ? baseUrl : "" };
  }

  save(input: AiSettingsInput): void {
    const provider = isAiProvider(input.provider) ? input.provider : "openai";
    const info = aiProvider(provider);
    const baseUrl = (input.baseUrl || "").trim().replace(/\/$/, "");
    if (provider === "compatible" && !baseUrl) {
      throw new Error("Podaj adres API zgodnego z OpenAI (np. http://localhost:11434/v1).");
    }
    let model = (input.model || "").trim();
    if (provider === "gemini" && RETIRED_GEMINI.test(model)) model = info.defaultModel;
    this.#settings.set("ai_provider", provider);
    this.#settings.set("ai_model", model || info.defaultModel);
    this.#settings.set("ai_base_url", baseUrl);
    const key = (input.apiKey || "").trim();
    if (key) {
      this.#settings.set("ai_api_key", key);
      this.#settings.set("openai_api_key", key);
    }
    if (!this.hasKey()) throw new Error("Wklej klucz API.");
  }

  savedModel(): string {
    return this.#settings.get("ai_model");
  }

  setModel(model: string): void {
    this.#settings.set("ai_model", model);
  }

  #provider(): AiProviderId {
    const saved = this.#settings.get("ai_provider") || this.#runtime.env("AI_PROVIDER");
    if (isAiProvider(saved)) return saved;
    if (
      !this.#settings.get("ai_api_key") &&
      !this.#settings.get("openai_api_key") &&
      !this.#runtime.env("OPENAI_API_KEY") &&
      this.#runtime.env("GEMINI_API_KEY")
    ) {
      return "gemini";
    }
    return "openai";
  }

  #envKey(provider: AiProviderId): string {
    if (provider === "gemini") return this.#runtime.env("GEMINI_API_KEY");
    if (provider === "anthropic") return this.#runtime.env("ANTHROPIC_API_KEY");
    return this.#runtime.env("OPENAI_API_KEY");
  }
}
