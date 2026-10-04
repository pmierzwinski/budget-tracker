import { DEFAULT_AMOUNT_THRESHOLDS, MAX_AMOUNT_THRESHOLDS } from "../../../shared/domain.ts";
import { round2 } from "../../../shared/numbers.ts";
import { db } from "../../platform/db.ts";

export function getSetting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJsonSetting(key: string, value: unknown): void {
  setSetting(key, JSON.stringify(value));
}

export function amountThresholds(): number[] {
  const raw = getSetting("amount_buckets");
  if (!raw) return DEFAULT_AMOUNT_THRESHOLDS;
  const values = raw
    .split(",")
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? [...new Set(values)].sort((a, b) => a - b) : DEFAULT_AMOUNT_THRESHOLDS;
}

const KEEP_SETTINGS = new Set([
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

/** Drops user settings; keeps migration flags and pasted API keys. */
export function resetUserSettings(): void {
  const rows = db.prepare("SELECT key FROM settings").all() as { key: string }[];
  const remove = db.prepare("DELETE FROM settings WHERE key = ?");
  for (const row of rows) {
    if (row.key.startsWith("migration.") || KEEP_SETTINGS.has(row.key)) continue;
    remove.run(row.key);
  }
}

export function setAmountThresholds(values: number[]): number[] {
  const clean = [...new Set(values.map(round2))].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) throw new Error("Podaj co najmniej jeden próg kwoty.");
  if (clean.length > MAX_AMOUNT_THRESHOLDS) throw new Error("Maksymalnie 9 progów — wykres robi się nieczytelny.");
  setSetting("amount_buckets", clean.join(","));
  return clean;
}
