// AI providers (Strategy): JSON-mode chat and model listing for OpenAI (and compatible APIs), Gemini and Claude.
import { aiProvider, type AiModelOption, type AiProviderId } from "../../../shared/ai";

export type ChatRequest = { system: string; user: string; temperature: number };

export type ProviderConfig = { apiKey: string; baseUrl: string; model: string };

export interface ChatProvider {
  chat(request: ChatRequest, config: ProviderConfig): Promise<unknown>;
  listModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]>;
}

/** Shared response handling: error messages and JSON parsing of the model's text. */
abstract class BaseProvider implements ChatProvider {
  abstract chat(request: ChatRequest, config: ProviderConfig): Promise<unknown>;
  abstract listModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]>;

  protected static parseModelJson(raw: string): unknown {
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

  protected static apiError(data: unknown, fallback: string): string {
    if (data && typeof data === "object") {
      const err = (data as { error?: { message?: string } | string }).error;
      if (typeof err === "string" && err.trim()) return err;
      if (err && typeof err === "object" && err.message) return err.message;
    }
    return fallback;
  }

  protected static sortModels(models: AiModelOption[]): AiModelOption[] {
    return [...models].sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id.localeCompare(b.id));
  }
}

/** OpenAI and any OpenAI-compatible API (`/chat/completions`, `/models`). */
export class OpenAiProvider extends BaseProvider {
  async chat({ system, user, temperature }: ChatRequest, { apiKey, baseUrl, model }: ProviderConfig): Promise<unknown> {
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
    if (!response.ok) throw new Error(BaseProvider.apiError(data, `AI ${response.status}`));
    return BaseProvider.parseModelJson(data.choices?.[0]?.message?.content || "{}");
  }

  async listModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
    if (!baseUrl) throw new Error("Brak adresu API.");
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const data = (await response.json()) as { error?: { message?: string }; data?: { id?: string }[] };
    if (!response.ok) throw new Error(BaseProvider.apiError(data, `AI ${response.status}`));
    return BaseProvider.sortModels(
      (data.data || [])
        .map((row) => String(row.id || "").trim())
        .filter((id) => /^(gpt-|o[1-4]-|chatgpt-)/i.test(id) && !/realtime|audio|transcribe|tts|image|instruct|search/i.test(id))
        .map((id) => ({ id, name: id })),
    );
  }
}

export class GeminiProvider extends BaseProvider {
  /** The API lists models as "models/<id>". */
  static modelId(model: string): string {
    return model.replace(/^models\//, "");
  }

  async chat({ system, user, temperature }: ChatRequest, { apiKey, baseUrl, model }: ProviderConfig): Promise<unknown> {
    const root = baseUrl || aiProvider("gemini").defaultBaseUrl;
    const id = GeminiProvider.modelId(model);
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
    if (!response.ok) throw new Error(BaseProvider.apiError(data, `Gemini ${response.status}`));
    return BaseProvider.parseModelJson(data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "{}");
  }

  async listModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
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
      if (!response.ok) throw new Error(BaseProvider.apiError(data, `Gemini ${response.status}`));
      for (const row of data.models || []) {
        const methods = row.supportedGenerationMethods || [];
        if (!methods.includes("generateContent")) continue;
        const id = GeminiProvider.modelId(String(row.name || ""));
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
    return BaseProvider.sortModels(models);
  }
}

export class AnthropicProvider extends BaseProvider {
  async chat({ system, user, temperature }: ChatRequest, { apiKey, baseUrl, model }: ProviderConfig): Promise<unknown> {
    const root = baseUrl || aiProvider("anthropic").defaultBaseUrl;
    const response = await fetch(`${root}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
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
    if (!response.ok) throw new Error(BaseProvider.apiError(data, `Claude ${response.status}`));
    const text = (data.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join("");
    return BaseProvider.parseModelJson(text || "{}");
  }

  async listModels(apiKey: string, baseUrl: string): Promise<AiModelOption[]> {
    const root = baseUrl || aiProvider("anthropic").defaultBaseUrl;
    const response = await fetch(`${root}/models?limit=100`, {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    });
    const data = (await response.json()) as {
      error?: { message?: string };
      data?: { id?: string; display_name?: string }[];
    };
    if (!response.ok) throw new Error(BaseProvider.apiError(data, `Claude ${response.status}`));
    return BaseProvider.sortModels(
      (data.data || [])
        .map((row) => ({ id: String(row.id || "").trim(), name: row.display_name || String(row.id || "") }))
        .filter((row) => row.id),
    );
  }
}

export class AiProviderFactory {
  static create(id: AiProviderId): ChatProvider {
    if (id === "gemini") return new GeminiProvider();
    if (id === "anthropic") return new AnthropicProvider();
    return new OpenAiProvider();
  }
}
