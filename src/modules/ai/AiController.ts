import type { Router } from "express";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { CategoryService } from "../categories/CategoryService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import type { AiCategorizationService } from "./AiCategorizationService.ts";
import type { AiClient } from "./AiClient.ts";
import type { AiSettings } from "./AiSettings.ts";
import type { PeriodEvaluationService } from "./PeriodEvaluationService.ts";

const { text, typed } = RequestReader;

export class AiController extends Controller {
  readonly #settings: AiSettings;
  readonly #client: AiClient;
  readonly #categorization: AiCategorizationService;
  readonly #evaluations: PeriodEvaluationService;
  readonly #transactions: TransactionRepository;
  readonly #categories: CategoryService;

  constructor(
    settings: AiSettings,
    client: AiClient,
    categorization: AiCategorizationService,
    evaluations: PeriodEvaluationService,
    transactions: TransactionRepository,
    categories: CategoryService,
  ) {
    super();
    this.#settings = settings;
    this.#client = client;
    this.#categorization = categorization;
    this.#evaluations = evaluations;
    this.#transactions = transactions;
    this.#categories = categories;
  }

  register(router: Router): void {
    router.post(
      "/ai/key",
      this.handle("Nie zapisano klucza", (req) => {
        const body = req.body || {};
        this.#settings.save({
          provider: text(body.provider) || "openai",
          apiKey: text(body.apiKey),
          model: text(body.model),
          baseUrl: text(body.baseUrl),
        });
        return { ok: true, hasAiKey: this.#settings.hasKey(), ai: this.#settings.publicInfo() };
      }),
    );

    router.post(
      "/ai/models",
      this.handle("Nie pobrano listy modeli", async (req) => {
        const body = req.body || {};
        return this.#client.listModels({
          provider: text(body.provider),
          apiKey: text(body.apiKey),
          baseUrl: text(body.baseUrl),
        });
      }),
    );

    router.post(
      "/ai/categorize",
      this.handle("Kategoryzacja AI nie powiodła się", async (req) => {
        const ids: string[] | undefined = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)) : undefined;
        const result = await this.#categorization.categorize(ids?.length ? ids : undefined);
        return { ...result, uncategorized: this.#transactions.countUncategorized(), categories: this.#categories.list() };
      }),
    );

    router.get(
      "/ai/evaluations",
      this.handle("Nie wczytano ocen", () => ({ evaluations: this.#evaluations.list(), hasAiKey: this.#settings.hasKey() })),
    );

    router.post(
      "/ai/evaluate",
      this.handle("Ocena AI nie powiodła się", async (req) => {
        const body = req.body || {};
        const evaluation = await this.#evaluations.evaluate(RequestReader.filters(body), {
          minAmount: typed(body.minAmount),
          maxAmount: typed(body.maxAmount),
        });
        return { evaluation, evaluations: this.#evaluations.list(), hasAiKey: this.#settings.hasKey() };
      }),
    );
  }
}
