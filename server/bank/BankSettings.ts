// Bank connection state (app keys, sessions, tokens) in data/bank.json — kept by the server, never sent whole to the browser.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Institution } from "../../shared/types.ts";
import { readStore } from "../store.ts";

export class BankSettings {
  readonly #file: string;
  #values: Record<string, string>;

  /** The first time, bank keys and sessions are taken over from the old settings table. */
  constructor(appRoot: string) {
    this.#file = join(appRoot, "data", "bank.json");
    if (existsSync(this.#file)) {
      this.#values = JSON.parse(readFileSync(this.#file, "utf8")) as Record<string, string>;
    } else {
      const old = readStore(appRoot).settings;
      this.#values = Object.fromEntries(Object.entries(old).filter(([key]) => /^(enablebanking|gocardless)_/.test(key)));
    }
  }

  get(key: string): string {
    return this.#values[key] || "";
  }

  set(key: string, value: string): void {
    this.#values = { ...this.#values, [key]: value };
    mkdirSync(join(this.#file, ".."), { recursive: true });
    writeFileSync(this.#file, JSON.stringify(this.#values, null, 2));
  }

  getJson<T>(key: string, fallback: T): T {
    try {
      return this.get(key) ? (JSON.parse(this.get(key)) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  setJson(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }
}

/** JSON request to a bank-data provider; errors carry the provider name, status and its message. */
export async function providerFetch(
  provider: string,
  errorDetail: (body: Record<string, unknown> | null) => unknown,
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
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
    throw new Error(`${provider} ${response.status}: ${errorDetail(body) || text.slice(0, 300)}`);
  }
  return data;
}

export function sortInstitutions(items: Institution[]): Institution[] {
  return items.sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

export function utcDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
