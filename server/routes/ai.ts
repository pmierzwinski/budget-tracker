import { Router } from "express";
import { countUncategorized, listCategories, listPeriodEvaluations } from "../db/index.ts";
import { aiPublic, categorizeWithAi, evaluateCurrentPeriod, hasAiKey, listAiModels, saveAiSettings } from "../modules/ai/ai.ts";
import { readFilters, route, text, typed } from "../platform/http.ts";

export const aiRoutes = Router();

aiRoutes.post(
  "/ai/key",
  route("Nie zapisano klucza", (req) => {
    const body = req.body || {};
    saveAiSettings({
      provider: text(body.provider) || "openai",
      apiKey: text(body.apiKey),
      model: text(body.model),
      baseUrl: text(body.baseUrl),
    });
    return { ok: true, hasAiKey: hasAiKey(), ai: aiPublic() };
  }),
);

aiRoutes.post(
  "/ai/models",
  route("Nie pobrano listy modeli", async (req) => {
    const body = req.body || {};
    return listAiModels({
      provider: text(body.provider),
      apiKey: text(body.apiKey),
      baseUrl: text(body.baseUrl),
    });
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
