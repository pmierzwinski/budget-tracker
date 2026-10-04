// Accounts, CSV import, demo data and clearing.
import { Router } from "express";
import multer from "multer";
import type { ImportResult } from "../../shared/types.ts";
import { categorizeWithAi } from "../modules/ai/ai.ts";
import { bankName, parseBankCsv } from "../modules/importer/csv/index.ts";
import {
  clearAll,
  clearTransactions,
  countTransactions,
  createAccount,
  dateBounds,
  deleteAccount,
  deleteDemo,
  getAccount,
  insertTransactions,
  listAccounts,
  recategorizeAll,
  resolveImportAccount,
  updateAccount,
  userCategorizer,
} from "../db/index.ts";
import { resetDemoAccount } from "../modules/importer/demo.ts";
import { route, text } from "../platform/http.ts";
import { reenterSession } from "../sessions.ts";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

export const accountRoutes = Router();

accountRoutes.get(
  "/accounts",
  route("Nie wczytano kont", () => ({ accounts: listAccounts() })),
);

accountRoutes.post(
  "/accounts",
  route("Nie dodano konta", (req) => {
    const account = createAccount({
      name: text(req.body?.name),
      bank: String(req.body?.bank || "generic"),
      iban: text(req.body?.iban),
    });
    return { account, accounts: listAccounts() };
  }),
);

accountRoutes.patch(
  "/accounts/:id",
  route("Nie zapisano konta", (req) => {
    const account = updateAccount(String(req.params.id), {
      name: req.body?.name != null ? String(req.body.name) : undefined,
      iban: req.body?.iban != null ? String(req.body.iban) : undefined,
    });
    return { account, accounts: listAccounts() };
  }),
);

accountRoutes.delete(
  "/accounts/:id",
  route("Nie usunięto konta", (req) => ({ removed: deleteAccount(String(req.params.id)), accounts: listAccounts() })),
);

// multer loses the async context, so the session database has to be re-entered after the upload.
accountRoutes.post(
  "/import",
  upload.single("file"),
  reenterSession,
  route("Import nie powiódł się", async (req) => {
    if (!req.file?.buffer) throw new Error("Wybierz plik CSV z bankowości.");
    const parsed = parseBankCsv(req.file.buffer, {
      bank: text(req.body?.bank) || undefined,
      categorize: userCategorizer(),
    });
    const account = resolveImportAccount(String(req.body?.account || "auto"), {
      bank: parsed.bank,
      iban: parsed.iban,
      bankName: bankName(parsed.bank),
      accountName: text(req.body?.accountName),
    });
    const items = parsed.items.map((item) => ({ ...item, accountId: account.id }));
    const replaceCsv = text(req.body?.replaceCsv) === "1";
    const result = insertTransactions(items, { replaceCsvFor: replaceCsv ? account.id : undefined });
    const useAi = text(req.body?.ai) === "1";
    const ai = useAi && result.ids.length ? await categorizeWithAi(result.ids) : null;
    return {
      ...result,
      total: items.length,
      ai,
      bank: parsed.bank,
      bankName: bankName(parsed.bank),
      account: getAccount(account.id)!,
      accounts: listAccounts(),
      ...dateBounds(account.id),
    } satisfies ImportResult;
  }),
);

accountRoutes.post(
  "/import/demo",
  route("Nie udało się wczytać przykładu", (req) => resetDemoAccount({ uncategorized: Boolean(req.body?.uncategorized) })),
);

accountRoutes.post(
  "/recategorize",
  route("Nie przeliczono kategorii", () => {
    deleteDemo();
    const changed = recategorizeAll();
    return { changed, ...dateBounds(), total: countTransactions() };
  }),
);

accountRoutes.delete(
  "/data",
  route("Nie usunięto danych", (req) => {
    if (text(req.query.all) === "1") clearAll();
    else clearTransactions();
    return { ok: true };
  }),
);
