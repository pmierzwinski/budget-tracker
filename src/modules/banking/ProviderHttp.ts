import type { Institution } from "../shared/types.ts";

export type ErrorDetail = (body: Record<string, unknown> | null) => unknown;

/** JSON requests to one bank-data provider; errors carry the provider name, status and its message. */
export class ProviderHttp {
  readonly #provider: string;
  readonly #errorDetail: ErrorDetail;

  constructor(provider: string, errorDetail: ErrorDetail) {
    this.#provider = provider;
    this.#errorDetail = errorDetail;
  }

  static sortInstitutions(items: Institution[]): Institution[] {
    return items.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async fetch(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: { accept: "application/json", "content-type": "application/json", ...(init.headers as Record<string, string>) },
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const body = typeof data === "object" && data ? (data as Record<string, unknown>) : null;
      const detail = this.#errorDetail(body) || text.slice(0, 300);
      throw new Error(`${this.#provider} ${response.status}: ${detail}`);
    }
    return data;
  }
}