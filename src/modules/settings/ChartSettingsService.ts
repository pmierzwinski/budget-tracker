import { DEFAULT_AMOUNT_THRESHOLDS, MAX_AMOUNT_THRESHOLDS } from "../shared/domain.ts";
import { round2 } from "../shared/numbers.ts";
import type { SettingsRepository } from "./SettingsRepository.ts";

const KEY = "amount_buckets";

/** Thresholds of the "Wielkość płatności" buckets (sorted, unique, at most 9). */
export class ChartSettingsService {
  readonly #settings: SettingsRepository;

  constructor(settings: SettingsRepository) {
    this.#settings = settings;
  }

  amountThresholds(): number[] {
    const raw = this.#settings.get(KEY);
    if (!raw) return DEFAULT_AMOUNT_THRESHOLDS;
    const values = raw
      .split(",")
      .map((part) => Number(part))
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? [...new Set(values)].sort((a, b) => a - b) : DEFAULT_AMOUNT_THRESHOLDS;
  }

  setAmountThresholds(values: number[]): number[] {
    const clean = [...new Set(values.map(round2))]
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!clean.length) throw new Error("Podaj co najmniej jeden próg kwoty.");
    if (clean.length > MAX_AMOUNT_THRESHOLDS) throw new Error("Maksymalnie 9 progów — wykres robi się nieczytelny.");
    this.#settings.set(KEY, clean.join(","));
    return clean;
  }
}
