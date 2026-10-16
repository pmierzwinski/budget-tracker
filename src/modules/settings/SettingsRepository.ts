import { Repository } from "../core/Repository.ts";

/** Keys kept by a full reset: pasted API keys and provider secrets. Migration flags are always kept. */
const KEEP_ON_RESET = new Set([
  "openai_api_key",
  "ai_api_key",
  "ai_provider",
  "ai_model",
  "ai_base_url",
  "gocardless_secret_id",
  "gocardless_secret_key",
  "enablebanking_app_id",
  "enablebanking_private_key",
]);

/** Key/value settings table, also used for JSON blobs (sessions, overrides, tokens). */
export class SettingsRepository extends Repository {
  get(key: string): string {
    return this.one<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value ?? "";
  }

  set(key: string, value: string): void {
    this.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }

  getJson<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  setJson(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }

  /** Drops user settings; keeps migration flags and pasted API keys. */
  resetUserSettings(): void {
    const remove = this.db.prepare("DELETE FROM settings WHERE key = ?");
    for (const row of this.all<{ key: string }>("SELECT key FROM settings")) {
      if (row.key.startsWith("migration.") || KEEP_ON_RESET.has(row.key)) continue;
      remove.run(row.key);
    }
  }
}
