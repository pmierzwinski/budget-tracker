// Meta, transactions, stats and insights.
import { Router } from "express";
import type { Meta, TransactionsResult } from "../../shared/types.ts";
import { aiPublic, hasAiKey } from "../modules/ai/ai.ts";
import { BANKS } from "../modules/importer/csv/index.ts";
import {
  amountThresholds,
  applyCategory,
  countExcluded,
  countTransactions,
  countUncategorized,
  dateBounds,
  getInsights,
  getStats,
  listAccounts,
  listCategories,
  listCategoryLimits,
  listRules,
  listTransactions,
  setExcluded,
  updateComment,
} from "../db/index.ts";
import { downloadUrl, hosted, packaged } from "../runtime.ts";
import { readAccount, readFilters, route, text } from "../platform/http.ts";

export const dataRoutes = Router();

dataRoutes.get(
  "/meta",
  route("Nie wczytano danych", (req) => {
    const account = readAccount(req.query.account);
    return {
      ...dateBounds(account),
      total: countTransactions(account),
      uncategorized: countUncategorized(account),
      excluded: countExcluded(account),
      categories: listCategories(),
      limits: listCategoryLimits(),
      rules: listRules(),
      hasAiKey: hasAiKey(),
      ai: aiPublic(),
      accounts: listAccounts(),
      banks: [...BANKS],
      amountThresholds: amountThresholds(),
      app: { hosted, packaged, downloadUrl: downloadUrl() },
    } satisfies Meta;
  }),
);

dataRoutes.get(
  "/transactions",
  route("Nie wczytano płatności", (req) => {
    const filters = readFilters(req.query);
    const { items, matched } = listTransactions(filters);
    return {
      items,
      matched,
      categories: listCategories(),
      total: countTransactions(filters.account),
      ...dateBounds(filters.account),
    } satisfies TransactionsResult;
  }),
);

dataRoutes.patch(
  "/transactions/:id",
  route("Nie zapisano zmian", (req) => {
    const id = String(req.params.id);
    const body = req.body || {};
    const hasComment = Object.prototype.hasOwnProperty.call(body, "comment");
    const hasExcluded = typeof body.excluded === "boolean";
    const category = text(body.category).trim();
    if (!hasComment && !category && !hasExcluded) throw new Error("Podaj kategorię, komentarz albo ukrycie");
    const comment = hasComment ? updateComment(id, String(body.comment ?? "")) : undefined;
    if (hasExcluded) setExcluded(id, body.excluded);
    if (!category) return { ok: true, comment, excluded: hasExcluded ? body.excluded : undefined };
    return {
      ok: true,
      comment,
      ...applyCategory(id, category, {
        onlyThis: body.onlyThis !== false,
        force: body.force === true,
        manual: body.manual !== false,
      }),
    };
  }),
);

dataRoutes.get(
  "/stats",
  route("Nie policzono statystyk", (req) => getStats(readFilters(req.query))),
);

dataRoutes.get(
  "/insights",
  route("Nie policzono szczegółów", (req) => getInsights(readFilters(req.query))),
);
