import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { categorizeWithAi, evaluateCurrentPeriod, hasAiKey } from "./ai.ts";
import type { TxFilters } from "./types.ts";
import {
  addCustomCategory,
  addRule,
  applyCategory,
  clearAll,
  clearTransactions,
  countTransactions,
  countUncategorized,
  dateBounds,
  deleteCategory,
  deleteDemo,
  deleteRule,
  hiddenCategoryNames,
  getSetting,
  getStats,
  insertTransactions,
  listBankAccounts,
  listCategories,
  listPeriodEvaluations,
  listRules,
  listTransactions,
  recategorizeAll,
  updateComment,
  renameCategory,
  setCategoryLimit,
  listCategoryLimits,
  setSetting,
} from "./db.ts";
import { loadEnvFile } from "./env.ts";
import { connectionStatus, startConnection, syncAccounts } from "./gocardless.ts";
import { parsePkoCsv } from "./pko-csv.ts";

loadEnvFile();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const app = express();
const port = Number(process.env.PORT || 8787);
const dist = join(root, "dist");
const publicUrl =
  process.env.PUBLIC_URL ||
  (existsSync(dist) ? `http://localhost:${port}` : "http://localhost:5173");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function readFilters(query: express.Request["query"]): TxFilters {
  const num = (value: unknown) => {
    if (typeof value !== "string" || value === "") return undefined;
    const parsed = Number(value.replace(",", "."));
    return Number.isNaN(parsed) ? undefined : parsed;
  };
  const sort = String(query.sort || "date_desc");
  const sorts: NonNullable<TxFilters["sort"]>[] = [
    "date_desc",
    "date_asc",
    "amount_desc",
    "amount_asc",
    "category_asc",
    "category_desc",
  ];
  return {
    from: typeof query.from === "string" && query.from ? query.from : undefined,
    to: typeof query.to === "string" && query.to ? query.to : undefined,
    category: typeof query.category === "string" ? query.category : undefined,
    q: typeof query.q === "string" ? query.q : undefined,
    minAmount: num(query.minAmount),
    maxAmount: num(query.maxAmount),
    kind: query.kind === "expense" || query.kind === "income" ? query.kind : "all",
    sort: sorts.includes(sort as NonNullable<TxFilters["sort"]>)
      ? (sort as NonNullable<TxFilters["sort"]>)
      : "date_desc",
  };
}

app.get("/api/meta", (_req, res) => {
  res.json({
    ...dateBounds(),
    total: countTransactions(),
    uncategorized: countUncategorized(),
    categories: listCategories(),
    limits: listCategoryLimits(),
    rules: listRules(),
    hasAiKey: hasAiKey(),
  });
});

app.get("/api/transactions", (req, res) => {
  const { items, matched } = listTransactions(readFilters(req.query));
  res.json({
    items,
    matched,
    categories: listCategories(),
    total: countTransactions(),
    ...dateBounds(),
  });
});

app.patch("/api/transactions/:id", (req, res) => {
  const id = String(req.params.id);
  const hasComment = Object.prototype.hasOwnProperty.call(req.body || {}, "comment");
  const category = String(req.body?.category || "").trim();
  if (!hasComment && !category) {
    res.status(400).json({ error: "Podaj kategorię albo komentarz" });
    return;
  }
  try {
    const comment = hasComment ? updateComment(id, String(req.body.comment ?? "")) : undefined;
    if (!category) {
      res.json({ ok: true, comment });
      return;
    }
    const result = applyCategory(id, category, {
      onlyThis: req.body?.onlyThis !== false,
    });
    res.json({ ok: true, comment, ...result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie zapisano zmian" });
  }
});

app.post("/api/categories", (req, res) => {
  try {
    const name = addCustomCategory(String(req.body?.name || ""));
    res.json({ name, categories: listCategories() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie dodano kategorii" });
  }
});

app.patch("/api/categories", (req, res) => {
  try {
    const result = renameCategory(String(req.body?.from || ""), String(req.body?.to || ""));
    res.json({ ...result, limits: listCategoryLimits() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie zmieniono nazwy" });
  }
});

app.delete("/api/categories", (req, res) => {
  try {
    const name = String(req.query.name || req.body?.name || "");
    const result = deleteCategory(name);
    res.json({ ...result, limits: listCategoryLimits() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie usunięto kategorii" });
  }
});

app.put("/api/category-limits", (req, res) => {
  try {
    const raw = req.body?.monthlyLimit;
    const monthlyLimit =
      raw == null || raw === ""
        ? null
        : Number(String(raw).replace(",", "."));
    if (monthlyLimit != null && !Number.isFinite(monthlyLimit)) {
      res.status(400).json({ error: "Podaj kwotę limitu" });
      return;
    }
    const limits = setCategoryLimit(String(req.body?.category || ""), monthlyLimit);
    res.json({ limits, categories: listCategories() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie zapisano limitu" });
  }
});

app.get("/api/stats", (req, res) => {
  res.json(getStats(readFilters(req.query)));
});

app.get("/api/rules", (_req, res) => {
  res.json({ rules: listRules(), categories: listCategories() });
});

app.post("/api/rules", (req, res) => {
  try {
    const result = addRule(String(req.body?.pattern || ""), String(req.body?.category || ""));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie zapisano reguły" });
  }
});

app.delete("/api/rules/:id", (req, res) => {
  deleteRule(String(req.params.id));
  recategorizeAll();
  res.json({ ok: true });
});

app.post("/api/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Wybierz plik CSV z iPKO." });
      return;
    }
    const replaceCsv = String(req.body?.replaceCsv || "") === "1";
    const useAi = String(req.body?.ai || "") === "1";
    const items = parsePkoCsv(req.file.buffer, "csv", listRules(), hiddenCategoryNames());
    const result = insertTransactions(items, { replaceCsv });
    let ai = null;
    if (useAi && result.ids.length) {
      ai = await categorizeWithAi(result.ids);
    }
    res.json({ ...result, total: items.length, ai, ...dateBounds() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Import nie powiódł się" });
  }
});

app.post("/api/import/demo", (_req, res) => {
  try {
    const file = join(root, "server", "fixtures", "pko-przyklad.csv");
    const items = parsePkoCsv(readFileSync(file), "demo", listRules(), hiddenCategoryNames());
    const result = insertTransactions(items);
    res.json({ ...result, total: items.length, ...dateBounds() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie udało się wczytać przykładu" });
  }
});

app.post("/api/recategorize", (_req, res) => {
  deleteDemo();
  const changed = recategorizeAll();
  res.json({ changed, ...dateBounds(), total: countTransactions() });
});

app.delete("/api/data", (req, res) => {
  if (String(req.query.all || "") === "1") clearAll();
  else clearTransactions();
  res.json({ ok: true });
});

app.post("/api/ai/key", (req, res) => {
  const apiKey = String(req.body?.apiKey || "").trim();
  setSetting("openai_api_key", apiKey);
  res.json({ ok: true, hasAiKey: hasAiKey() });
});

app.post("/api/ai/categorize", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)) : undefined;
    const result = await categorizeWithAi(ids?.length ? ids : undefined);
    res.json({ ...result, uncategorized: countUncategorized(), categories: listCategories() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Kategoryzacja AI nie powiodła się" });
  }
});

app.get("/api/ai/evaluations", (_req, res) => {
  res.json({ evaluations: listPeriodEvaluations(), hasAiKey: hasAiKey() });
});

app.post("/api/ai/evaluate", async (req, res) => {
  try {
    const num = (value: unknown) => {
      if (value == null || value === "") return undefined;
      const parsed = Number(String(value).replace(",", "."));
      return Number.isNaN(parsed) ? undefined : parsed;
    };
    const kindRaw = String(req.body?.kind || "");
    const evaluation = await evaluateCurrentPeriod({
      from: String(req.body?.from || ""),
      to: String(req.body?.to || ""),
      category: String(req.body?.category || "").trim() || undefined,
      kind: kindRaw === "expense" || kindRaw === "income" ? kindRaw : undefined,
      minAmount: num(req.body?.minAmount),
      maxAmount: num(req.body?.maxAmount),
      minAmountRaw: req.body?.minAmount == null || req.body?.minAmount === "" ? undefined : String(req.body.minAmount),
      maxAmountRaw: req.body?.maxAmount == null || req.body?.maxAmount === "" ? undefined : String(req.body.maxAmount),
    });
    res.json({ evaluation, evaluations: listPeriodEvaluations(), hasAiKey: hasAiKey() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Ocena AI nie powiodła się" });
  }
});

app.get("/api/bank/status", (_req, res) => {
  res.json({
    ...connectionStatus(),
    accounts: listBankAccounts(),
  });
});

app.post("/api/bank/secrets", (req, res) => {
  const secretId = String(req.body?.secretId || "").trim();
  const secretKey = String(req.body?.secretKey || "").trim();
  if (!secretId || !secretKey) {
    res.status(400).json({ error: "Podaj Secret ID i Secret Key z portalu GoCardless." });
    return;
  }
  setSetting("gocardless_secret_id", secretId);
  setSetting("gocardless_secret_key", secretKey);
  setSetting("gocardless_token", "");
  res.json({ ok: true });
});

app.post("/api/bank/connect", async (req, res) => {
  try {
    const sandbox = Boolean(req.body?.sandbox);
    const redirect = `${publicUrl.replace(/\/$/, "")}/?bank=connected`;
    const result = await startConnection({ redirect, sandbox });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie udało się rozpocząć połączenia" });
  }
});

app.get("/api/bank/callback", (_req, res) => {
  res.redirect(`${publicUrl}/?bank=connected`);
});

app.post("/api/bank/sync", async (_req, res) => {
  try {
    const { imported, accounts } = await syncAccounts();
    const result = insertTransactions(imported);
    res.json({ ...result, accounts, total: imported.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Synchronizacja nie powiodła się" });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json({
    hasSecrets: Boolean(getSetting("gocardless_secret_id") || process.env.GOCARDLESS_SECRET_ID),
    hasAiKey: hasAiKey(),
  });
});

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Wydatki API: http://127.0.0.1:${port}`);
});
