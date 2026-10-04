// Categories, limits, rules, recurring statuses and chart settings.
import { Router } from "express";
import type { RecurringStatus } from "../../shared/types.ts";
import {
  addCustomCategory,
  amountThresholds,
  deleteCategory,
  deleteRule,
  listCategories,
  listCategoryLimits,
  listRules,
  renameCategory,
  setAmountThresholds,
  setCategoryLimit,
  setRecurringStatus,
  upsertRule,
} from "../db/index.ts";
import { route, text } from "../platform/http.ts";

export const categoryRoutes = Router();

categoryRoutes.post(
  "/categories",
  route("Nie dodano kategorii", (req) => {
    const name = addCustomCategory(text(req.body?.name));
    return { name, categories: listCategories() };
  }),
);

categoryRoutes.patch(
  "/categories",
  route("Nie zmieniono nazwy", (req) => ({
    ...renameCategory(text(req.body?.from), text(req.body?.to)),
    limits: listCategoryLimits(),
  })),
);

categoryRoutes.delete(
  "/categories",
  route("Nie usunięto kategorii", (req) => ({
    ...deleteCategory(text(req.query.name || req.body?.name)),
    limits: listCategoryLimits(),
  })),
);

categoryRoutes.put(
  "/category-limits",
  route("Nie zapisano limitu", (req) => {
    const raw = req.body?.monthlyLimit;
    const monthlyLimit = raw == null || raw === "" ? null : Number(String(raw).replace(",", "."));
    if (monthlyLimit != null && !Number.isFinite(monthlyLimit)) throw new Error("Podaj kwotę limitu");
    return { limits: setCategoryLimit(text(req.body?.category), monthlyLimit), categories: listCategories() };
  }),
);

categoryRoutes.get(
  "/rules",
  route("Nie wczytano reguł", () => ({ rules: listRules(), categories: listCategories() })),
);

categoryRoutes.post(
  "/rules",
  route("Nie zapisano reguły", (req) => upsertRule(text(req.body?.pattern), text(req.body?.category))),
);

categoryRoutes.delete(
  "/rules/:id",
  route("Nie usunięto reguły", (req) => {
    deleteRule(String(req.params.id));
    return { ok: true };
  }),
);

categoryRoutes.put(
  "/recurring",
  route("Nie zapisano statusu", (req) => {
    setRecurringStatus(text(req.body?.key), String(req.body?.status || "auto") as RecurringStatus);
    return { ok: true };
  }),
);

categoryRoutes.get(
  "/settings/amount-buckets",
  route("Nie wczytano przedziałów", () => ({ thresholds: amountThresholds() })),
);

categoryRoutes.put(
  "/settings/amount-buckets",
  route("Nie zapisano przedziałów", (req) => {
    const raw: unknown[] = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
    return { thresholds: setAmountThresholds(raw.map((value) => Number(value))) };
  }),
);
