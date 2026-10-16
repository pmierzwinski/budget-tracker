import { RECURRING_STATUSES } from "../shared/domain.ts";
import type { RecurringStatus } from "../shared/types.ts";
import type { SettingsRepository } from "../settings/SettingsRepository.ts";

const KEY = "recurring_overrides";

/** Statuses the user set on recurring payments (settings.recurring_overrides: key → status). */
export class RecurringOverrides {
  readonly #settings: SettingsRepository;

  constructor(settings: SettingsRepository) {
    this.#settings = settings;
  }

  all(): Record<string, RecurringStatus> {
    const parsed = this.#settings.getJson<Record<string, string>>(KEY, {});
    const clean: Record<string, RecurringStatus> = {};
    for (const [key, value] of Object.entries(parsed || {})) {
      if (RECURRING_STATUSES.includes(value as RecurringStatus) && value !== "auto") clean[key] = value as RecurringStatus;
    }
    return clean;
  }

  set(key: string, status: RecurringStatus): void {
    const clean = key.trim().toLowerCase();
    if (!clean) throw new Error("Brak nazwy płatności cyklicznej.");
    if (!RECURRING_STATUSES.includes(status)) throw new Error("Nieznany status płatności cyklicznej.");
    const overrides = this.all();
    if (status === "auto") delete overrides[clean];
    else overrides[clean] = status;
    this.#settings.setJson(KEY, overrides);
  }
}
