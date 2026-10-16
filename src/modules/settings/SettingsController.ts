import type { Router } from "express";
import { Controller } from "../core/Controller.ts";
import type { ChartSettingsService } from "./ChartSettingsService.ts";

export class SettingsController extends Controller {
  readonly #charts: ChartSettingsService;

  constructor(charts: ChartSettingsService) {
    super();
    this.#charts = charts;
  }

  register(router: Router): void {
    router.get(
      "/settings/amount-buckets",
      this.handle("Nie wczytano przedziałów", () => ({ thresholds: this.#charts.amountThresholds() })),
    );
    router.put(
      "/settings/amount-buckets",
      this.handle("Nie zapisano przedziałów", (req) => {
        const raw: unknown[] = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
        return { thresholds: this.#charts.setAmountThresholds(raw.map((value) => Number(value))) };
      }),
    );
  }
}
