import type { Router } from "express";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { BudgetService } from "./BudgetService.ts";
import type { CategoryService } from "./CategoryService.ts";
import type { RuleService } from "./RuleService.ts";

const { text } = RequestReader;

export class CategoriesController extends Controller {
  readonly #categories: CategoryService;
  readonly #rules: RuleService;
  readonly #budgets: BudgetService;

  constructor(categories: CategoryService, rules: RuleService, budgets: BudgetService) {
    super();
    this.#categories = categories;
    this.#rules = rules;
    this.#budgets = budgets;
  }

  register(router: Router): void {
    router.post(
      "/categories",
      this.handle("Nie dodano kategorii", (req) => {
        const name = this.#categories.add(text(req.body?.name));
        return { name, categories: this.#categories.list() };
      }),
    );

    router.patch(
      "/categories",
      this.handle("Nie zmieniono nazwy", (req) => ({
        ...this.#categories.rename(text(req.body?.from), text(req.body?.to)),
        limits: this.#budgets.list(),
      })),
    );

    router.delete(
      "/categories",
      this.handle("Nie usunięto kategorii", (req) => ({
        ...this.#categories.delete(text(req.query.name || req.body?.name)),
        limits: this.#budgets.list(),
      })),
    );

    router.put(
      "/category-limits",
      this.handle("Nie zapisano limitu", (req) => {
        const raw = req.body?.monthlyLimit;
        const monthlyLimit = raw == null || raw === "" ? null : Number(String(raw).replace(",", "."));
        if (monthlyLimit != null && !Number.isFinite(monthlyLimit)) throw new Error("Podaj kwotę limitu");
        return { limits: this.#budgets.set(text(req.body?.category), monthlyLimit), categories: this.#categories.list() };
      }),
    );

    router.get(
      "/rules",
      this.handle("Nie wczytano reguł", () => ({ rules: this.#rules.list(), categories: this.#categories.list() })),
    );

    router.post(
      "/rules",
      this.handle("Nie zapisano reguły", (req) => this.#rules.upsert(text(req.body?.pattern), text(req.body?.category))),
    );

    router.delete(
      "/rules/:id",
      this.handle("Nie usunięto reguły", (req) => {
        this.#rules.delete(String(req.params.id));
        return { ok: true };
      }),
    );
  }
}
