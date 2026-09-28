import { Router } from "express";
import { categorizeWithAi, evaluateCurrentPeriod, hasAiKey, saveAiKey } from "../ai.ts";
import { countUncategorized, listCategories, listPeriodEvaluations } from "../db/index.ts";
import { readFilters, route, text, typed } from "./http.ts";

export const aiRoutes = Router();

aiRoutes.post(
  "/ai/key",
  route("Nie zapisano klucza", (req) => {
    saveAiKey(text(req.body?.apiKey));
    return { ok: true, hasAiKey: hasAiKey() };
  }),
);

aiRoutes.post(
  "/ai/categorize",
  route("Kategoryzacja AI nie powiodła się", async (req) => {
    const ids: string[] | undefined = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)) : undefined;
    const result = await categorizeWithAi(ids?.length ? ids : undefined);
    return { ...result, uncategorized: countUncategorized(), categories: listCategories() };
  }),
);

aiRoutes.get(
  "/ai/evaluations",
  route("Nie wczytano ocen", () => ({ evaluations: listPeriodEvaluations(), hasAiKey: hasAiKey() })),
);

aiRoutes.post(
  "/ai/evaluate",
  route("Ocena AI nie powiodła się", async (req) => {
    const body = req.body || {};
    const evaluation = await evaluateCurrentPeriod(readFilters(body), {
      minAmount: typed(body.minAmount),
      maxAmount: typed(body.maxAmount),
    });
    return { evaluation, evaluations: listPeriodEvaluations(), hasAiKey: hasAiKey() };
  }),
);
