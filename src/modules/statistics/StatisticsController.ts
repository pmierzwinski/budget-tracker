import type { Router } from "express";
import type { RecurringStatus } from "../shared/types.ts";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { InsightsService } from "./InsightsService.ts";
import type { RecurringOverrides } from "./RecurringOverrides.ts";
import type { StatsService } from "./StatsService.ts";

export class StatisticsController extends Controller {
  readonly #stats: StatsService;
  readonly #insights: InsightsService;
  readonly #recurring: RecurringOverrides;

  constructor(stats: StatsService, insights: InsightsService, recurring: RecurringOverrides) {
    super();
    this.#stats = stats;
    this.#insights = insights;
    this.#recurring = recurring;
  }

  register(router: Router): void {
    router.get(
      "/stats",
      this.handle("Nie policzono statystyk", (req) => this.#stats.stats(RequestReader.filters(req.query))),
    );

    router.get(
      "/insights",
      this.handle("Nie policzono szczegółów", (req) => this.#insights.insights(RequestReader.filters(req.query))),
    );

    router.put(
      "/recurring",
      this.handle("Nie zapisano statusu", (req) => {
        this.#recurring.set(RequestReader.text(req.body?.key), String(req.body?.status || "auto") as RecurringStatus);
        return { ok: true };
      }),
    );
  }
}
