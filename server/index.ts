import cors from "cors";
import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { appRoot, hosted, packaged } from "./runtime.ts";
import { categorizeWithAi, evaluateCurrentPeriod, hasAiKey } from "./ai.ts";
import { BANKS, bankName, parseBankCsv } from "./bank-csv.ts";
import type { RecurringStatus, TxFilters } from "./types.ts";
import {
  addCustomCategory,
  addRule,
  amountThresholds,
  applyCategory,
  clearAll,
  clearTransactions,
  countTransactions,
  countExcluded,
  countUncategorized,
  createAccount,
  dateBounds,
  deleteAccount,
  deleteCategory,
  deleteDemo,
  deleteRule,
  findAccount,
  getAccount,
  getInsights,
  getStats,
  hiddenCategoryNames,
  insertTransactions,
  listAccounts,
  listCategories,
  listCategoryLimits,
  listPeriodEvaluations,
  listRules,
  listTransactions,
  recategorizeAll,
  renameCategory,
  setAmountThresholds,
  setCategoryLimit,
  setRecurringStatus,
  setExcluded,
  getSetting,
  setSetting,
  updateAccount,
  updateComment,
} from "./db.ts";
import {
  enableBankingStatus,
  finishEnableBanking,
  listAspsps,
  saveEnableBankingKeys,
  startEnableBanking,
  syncEnableBanking,
} from "./enablebanking.ts";
import { demoTransactions } from "./demo.ts";
import { reenterSession, sessionScope } from "./sessions.ts";
import { connectionStatus, listInstitutions, startConnection, syncAccounts } from "./gocardless.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const app = express();
const port = Number(process.env.PORT || 8787);
const dist = join(appRoot, "dist");
const releaseDir = join(appRoot, "release");
const DOWNLOAD_FILE = "Wydatki-Windows.zip";
const DEMO_ACCOUNT = "Konto testowe";
const DEMO_RAW_ACCOUNT = "Konto testowe bez kategorii";
const publicUrl = (
  process.env.PUBLIC_URL || (existsSync(dist) ? `http://localhost:${port}` : "http://localhost:5173")
).replace(/\/$/, "");
const apiUrl = (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "");
const enableBankingRedirect = `${apiUrl}/api/bank/enablebanking/callback`;

function frontendUrl(req: express.Request): string {
  const origin = req.get("origin") || "";
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === publicUrl;
  return allowed ? origin.replace(/\/$/, "") : publicUrl;
}

function downloadUrl(): string {
  if (packaged) return "";
  if (process.env.DOWNLOAD_URL) return process.env.DOWNLOAD_URL;
  return existsSync(join(releaseDir, DOWNLOAD_FILE)) ? `/download/${DOWNLOAD_FILE}` : "";
}

if (hosted) {
  app.set("trust proxy", true);
  app.use("/api", (req, res, next) => (req.path === "/health" ? next() : sessionScope(req, res, next)));
  app.use("/api/bank", (_req, res) => {
    res.status(403).json({ error: "W wersji online połączenie z bankiem jest wyłączone — pobierz aplikację." });
  });
} else {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

app.get(`/download/${DOWNLOAD_FILE}`, (_req, res) => {
  const file = join(releaseDir, DOWNLOAD_FILE);
  if (!existsSync(file)) {
    res.status(404).send("Paczka aplikacji nie jest jeszcze zbudowana (npm run package:win).");
    return;
  }
  res.download(file, DOWNLOAD_FILE);
});

function fail(res: express.Response, error: unknown, fallback: string) {
  res.status(400).json({ error: error instanceof Error ? error.message : fallback });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "wydatki" });
});

function readAccount(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

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
    account: readAccount(query.account),
    includeExcluded: query.includeExcluded === "1",
    excludedOnly: query.excludedOnly === "1",
    weekday: num(query.weekday),
    sort: sorts.includes(sort as NonNullable<TxFilters["sort"]>)
      ? (sort as NonNullable<TxFilters["sort"]>)
      : "date_desc",
  };
}

app.get("/api/meta", (req, res) => {
  const account = readAccount(req.query.account);
  res.json({
    ...dateBounds(account),
    total: countTransactions(account),
    uncategorized: countUncategorized(account),
    excluded: countExcluded(account),
    categories: listCategories(),
    limits: listCategoryLimits(),
    rules: listRules(),
    hasAiKey: hasAiKey(),
    accounts: listAccounts(),
    banks: BANKS,
    amountThresholds: amountThresholds(),
    app: { hosted, packaged, downloadUrl: downloadUrl() },
  });
});

app.get("/api/transactions", (req, res) => {
  const filters = readFilters(req.query);
  const { items, matched } = listTransactions(filters);
  res.json({
    items,
    matched,
    categories: listCategories(),
    total: countTransactions(filters.account),
    ...dateBounds(filters.account),
  });
});

app.patch("/api/transactions/:id", (req, res) => {
  const id = String(req.params.id);
  const body = req.body || {};
  const hasComment = Object.prototype.hasOwnProperty.call(body, "comment");
  const hasExcluded = typeof body.excluded === "boolean";
  const category = String(body.category || "").trim();
  if (!hasComment && !category && !hasExcluded) {
    res.status(400).json({ error: "Podaj kategorię, komentarz albo ukrycie" });
    return;
  }
  try {
    const comment = hasComment ? updateComment(id, String(body.comment ?? "")) : undefined;
    if (hasExcluded) setExcluded(id, body.excluded);
    if (!category) {
      res.json({ ok: true, comment, excluded: hasExcluded ? body.excluded : undefined });
      return;
    }
    const result = applyCategory(id, category, { onlyThis: body.onlyThis !== false });
    res.json({ ok: true, comment, ...result });
  } catch (error) {
    fail(res, error, "Nie zapisano zmian");
  }
});

app.post("/api/categories", (req, res) => {
  try {
    const name = addCustomCategory(String(req.body?.name || ""));
    res.json({ name, categories: listCategories() });
  } catch (error) {
    fail(res, error, "Nie dodano kategorii");
  }
});

app.patch("/api/categories", (req, res) => {
  try {
    const result = renameCategory(String(req.body?.from || ""), String(req.body?.to || ""));
    res.json({ ...result, limits: listCategoryLimits() });
  } catch (error) {
    fail(res, error, "Nie zmieniono nazwy");
  }
});

app.delete("/api/categories", (req, res) => {
  try {
    const name = String(req.query.name || req.body?.name || "");
    const result = deleteCategory(name);
    res.json({ ...result, limits: listCategoryLimits() });
  } catch (error) {
    fail(res, error, "Nie usunięto kategorii");
  }
});

app.put("/api/category-limits", (req, res) => {
  try {
    const raw = req.body?.monthlyLimit;
    const monthlyLimit = raw == null || raw === "" ? null : Number(String(raw).replace(",", "."));
    if (monthlyLimit != null && !Number.isFinite(monthlyLimit)) {
      res.status(400).json({ error: "Podaj kwotę limitu" });
      return;
    }
    const limits = setCategoryLimit(String(req.body?.category || ""), monthlyLimit);
    res.json({ limits, categories: listCategories() });
  } catch (error) {
    fail(res, error, "Nie zapisano limitu");
  }
});

app.get("/api/stats", (req, res) => {
  res.json(getStats(readFilters(req.query)));
});

app.get("/api/insights", (req, res) => {
  res.json(getInsights(readFilters(req.query)));
});

app.put("/api/recurring", (req, res) => {
  try {
    setRecurringStatus(String(req.body?.key || ""), String(req.body?.status || "auto") as RecurringStatus);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Nie zapisano statusu" });
  }
});

app.get("/api/rules", (_req, res) => {
  res.json({ rules: listRules(), categories: listCategories() });
});

app.post("/api/rules", (req, res) => {
  try {
    res.json(addRule(String(req.body?.pattern || ""), String(req.body?.category || "")));
  } catch (error) {
    fail(res, error, "Nie zapisano reguły");
  }
});

app.delete("/api/rules/:id", (req, res) => {
  deleteRule(String(req.params.id));
  recategorizeAll();
  res.json({ ok: true });
});

app.get("/api/accounts", (_req, res) => {
  res.json({ accounts: listAccounts() });
});

app.post("/api/accounts", (req, res) => {
  try {
    const account = createAccount({
      name: String(req.body?.name || ""),
      bank: String(req.body?.bank || "generic"),
      iban: String(req.body?.iban || ""),
    });
    res.json({ account, accounts: listAccounts() });
  } catch (error) {
    fail(res, error, "Nie dodano konta");
  }
});

app.patch("/api/accounts/:id", (req, res) => {
  try {
    const account = updateAccount(String(req.params.id), {
      name: req.body?.name != null ? String(req.body.name) : undefined,
      iban: req.body?.iban != null ? String(req.body.iban) : undefined,
    });
    res.json({ account, accounts: listAccounts() });
  } catch (error) {
    fail(res, error, "Nie zapisano konta");
  }
});

app.delete("/api/accounts/:id", (req, res) => {
  try {
    const removed = deleteAccount(String(req.params.id));
    res.json({ removed, accounts: listAccounts() });
  } catch (error) {
    fail(res, error, "Nie usunięto konta");
  }
});

app.get("/api/settings/amount-buckets", (_req, res) => {
  res.json({ thresholds: amountThresholds() });
});

app.put("/api/settings/amount-buckets", (req, res) => {
  try {
    const raw = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
    res.json({ thresholds: setAmountThresholds(raw.map((value: unknown) => Number(value))) });
  } catch (error) {
    fail(res, error, "Nie zapisano przedziałów");
  }
});

app.post("/api/import", upload.single("file"), reenterSession, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Wybierz plik CSV z bankowości." });
      return;
    }
    const replaceCsv = String(req.body?.replaceCsv || "") === "1";
    const useAi = String(req.body?.ai || "") === "1";
    const requestedAccount = String(req.body?.account || "auto");
    const parsed = parseBankCsv(req.file.buffer, {
      bank: String(req.body?.bank || "") || undefined,
      source: "csv",
      rules: listRules(),
      blocked: hiddenCategoryNames(),
    });

    let account = requestedAccount !== "auto" && requestedAccount !== "new" ? getAccount(requestedAccount) : null;
    if (requestedAccount === "new") {
      account = createAccount({
        name: String(req.body?.accountName || "").trim() || bankName(parsed.bank),
        bank: parsed.bank,
        iban: parsed.iban,
      });
    }
    if (!account) {
      account =
        findAccount({ iban: parsed.iban, bank: parsed.bank }) ||
        createAccount({ name: bankName(parsed.bank), bank: parsed.bank, iban: parsed.iban });
    }
    if (parsed.iban && !account.iban) account = updateAccount(account.id, { iban: parsed.iban });

    const items = parsed.items.map((item) => ({ ...item, accountId: account.id }));
    const result = insertTransactions(items, { replaceCsvFor: replaceCsv ? account.id : undefined });
    let ai = null;
    if (useAi && result.ids.length) {
      ai = await categorizeWithAi(result.ids);
    }
    res.json({
      ...result,
      total: items.length,
      ai,
      bank: parsed.bank,
      bankName: bankName(parsed.bank),
      account: getAccount(account.id),
      accounts: listAccounts(),
      ...dateBounds(account.id),
    });
  } catch (error) {
    fail(res, error, "Import nie powiódł się");
  }
});

app.post("/api/import/demo", (req, res) => {
  try {
    const uncategorized = Boolean(req.body?.uncategorized);
    const name = uncategorized ? DEMO_RAW_ACCOUNT : DEMO_ACCOUNT;
    const existing = listAccounts().find((row) => row.name === name);
    if (existing) deleteAccount(existing.id);
    const account = createAccount({ name, bank: "generic" });
    const items = demoTransactions(account.id, {
      rules: listRules(),
      blocked: hiddenCategoryNames(),
      uncategorized,
    });
    const result = insertTransactions(items);
    res.json({
      ...result,
      total: items.length,
      account: getAccount(account.id),
      accounts: listAccounts(),
      ...dateBounds(),
    });
  } catch (error) {
    fail(res, error, "Nie udało się wczytać przykładu");
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
    fail(res, error, "Kategoryzacja AI nie powiodła się");
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
    const account = readAccount(req.body?.account);
    const evaluation = await evaluateCurrentPeriod({
      from: String(req.body?.from || ""),
      to: String(req.body?.to || ""),
      category: String(req.body?.category || "").trim() || undefined,
      kind: kindRaw === "expense" || kindRaw === "income" ? kindRaw : undefined,
      minAmount: num(req.body?.minAmount),
      maxAmount: num(req.body?.maxAmount),
      minAmountRaw: req.body?.minAmount == null || req.body?.minAmount === "" ? undefined : String(req.body.minAmount),
      maxAmountRaw: req.body?.maxAmount == null || req.body?.maxAmount === "" ? undefined : String(req.body.maxAmount),
      account,
      accountName: account ? getAccount(account)?.name : undefined,
    });
    res.json({ evaluation, evaluations: listPeriodEvaluations(), hasAiKey: hasAiKey() });
  } catch (error) {
    fail(res, error, "Ocena AI nie powiodła się");
  }
});

app.get("/api/bank/status", (_req, res) => {
  res.json({
    gocardless: connectionStatus(),
    enablebanking: { ...enableBankingStatus(), redirectUrl: enableBankingRedirect },
    accounts: listAccounts().filter((account) => account.provider),
  });
});

app.post("/api/bank/gocardless/secrets", (req, res) => {
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

app.get("/api/bank/gocardless/institutions", async (_req, res) => {
  try {
    res.json({ institutions: await listInstitutions() });
  } catch (error) {
    fail(res, error, "Nie pobrano listy banków");
  }
});

app.post("/api/bank/gocardless/connect", async (req, res) => {
  try {
    const result = await startConnection({
      redirect: `${frontendUrl(req)}/?bank=connected&provider=gocardless`,
      sandbox: Boolean(req.body?.sandbox),
      institutionId: String(req.body?.institutionId || "") || undefined,
      institutionName: String(req.body?.institutionName || "") || undefined,
    });
    res.json(result);
  } catch (error) {
    fail(res, error, "Nie udało się rozpocząć połączenia");
  }
});

app.post("/api/bank/gocardless/sync", async (_req, res) => {
  try {
    const { imported, accounts } = await syncAccounts();
    const result = insertTransactions(imported);
    res.json({ ...result, accounts, total: imported.length });
  } catch (error) {
    fail(res, error, "Synchronizacja nie powiodła się");
  }
});

app.post("/api/bank/enablebanking/keys", (req, res) => {
  try {
    saveEnableBankingKeys(String(req.body?.appId || ""), String(req.body?.privateKey || ""));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "Nie zapisano kluczy");
  }
});

app.get("/api/bank/enablebanking/aspsps", async (_req, res) => {
  try {
    res.json({ aspsps: await listAspsps() });
  } catch (error) {
    fail(res, error, "Nie pobrano listy banków");
  }
});

app.post("/api/bank/enablebanking/connect", async (req, res) => {
  try {
    setSetting("enablebanking_return", frontendUrl(req));
    res.json(await startEnableBanking({ aspsp: String(req.body?.aspsp || ""), redirect: enableBankingRedirect }));
  } catch (error) {
    fail(res, error, "Nie udało się rozpocząć połączenia");
  }
});

app.get("/api/bank/enablebanking/callback", async (req, res) => {
  const back = getSetting("enablebanking_return") || publicUrl;
  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) {
    const message = String(req.query.error_description || error);
    res.redirect(`${back}/?bank=error&message=${encodeURIComponent(message)}`);
    return;
  }
  try {
    await finishEnableBanking(String(req.query.code || ""), String(req.query.state || ""));
    res.redirect(`${back}/?bank=connected&provider=enablebanking`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nie udało się dokończyć połączenia";
    res.redirect(`${back}/?bank=error&message=${encodeURIComponent(message)}`);
  }
});

app.post("/api/bank/enablebanking/sync", async (_req, res) => {
  try {
    const { imported, accounts } = await syncEnableBanking();
    const result = insertTransactions(imported);
    res.json({ ...result, accounts, total: imported.length });
  } catch (error) {
    fail(res, error, "Synchronizacja nie powiodła się");
  }
});

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
}

function openBrowser(url: string) {
  if (process.env.WYDATKI_NO_BROWSER === "1") return;
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function runningHere(candidate: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${candidate}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).app === "wydatki";
  } catch {
    return false;
  }
}

function listen(candidate: number, attempts: number) {
  const server = createServer(app);
  server.listen({ port: candidate, host: packaged ? "127.0.0.1" : undefined }, () => {
    const url = `http://127.0.0.1:${candidate}`;
    if (packaged) {
      console.log(`Wydatki działa: ${url}`);
      console.log("Dane zapisują się w folderze „data” obok programu. Zamknij to okno, żeby wyłączyć aplikację.");
      openBrowser(url);
    } else {
      console.log(`Wydatki API: http://127.0.0.1:${candidate}${hosted ? " (tryb online, osobne dane dla każdej sesji)" : ""}`);
    }
  });
  server.on("error", async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE" || !packaged || attempts <= 0) throw error;
    if (await runningHere(candidate)) {
      console.log("Wydatki już działają — otwieram przeglądarkę.");
      openBrowser(`http://127.0.0.1:${candidate}`);
      setTimeout(() => process.exit(0), 500);
      return;
    }
    listen(candidate + 1, attempts - 1);
  });
}

listen(port, 10);
