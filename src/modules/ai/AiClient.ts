import { aiProvider, isAiProvider, preferAiModel, type AiModelOption, type AiProviderId } from "../shared/ai.ts";
import type { AiSettings } from "./AiSettings.ts";
import { AiProviderFactory } from "./providers.ts";

export type ModelListRequest = { provider?: string; apiKey?: string; baseUrl?: string };

/** The configured AI provider: JSON chat and model listing. */
export class AiClient {
  readonly #settings: AiSettings;

  constructor(settings: AiSettings) {
    this.#settings = settings;
  }

  async chatJson(system: string, user: string, temperature: number): Promise<unknown> {
    const { provider, apiKey, baseUrl, model } = this.#settings.config();
    if (!apiKey) {
      throw new Error("Brak klucza AI. Wklej go w Ustawienia → AI.");
    }
    if (!model) throw new Error("Podaj nazwę modelu.");
    return AiProviderFactory.create(provider).chat({ system, user, temperature }, { apiKey, baseUrl, model });
  }

  /**
   * Models of the requested provider (key and URL from the request, else the saved ones). With the saved key
   * a retired saved model is replaced by the preferred one. "Inny" without a model list returns an empty list.
   */
  async listModels(input: ModelListRequest = {}): Promise<{ models: AiModelOption[]; selected: string }> {
    const saved = this.#settings.config();
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
      models = await AiProviderFactory.create(provider).listModels(apiKey, baseUrl);
    } catch (err) {
      if (provider === "compatible") return { models: [], selected: saved.model };
      throw err;
    }
    const selected = preferAiModel(provider, models, saved.provider === provider ? saved.model : "");
    if (selected && !input.apiKey && provider === saved.provider && selected !== this.#settings.savedModel()) {
      this.#settings.setModel(selected);
    }
    return { models, selected };
  }
}
