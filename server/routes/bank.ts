// Open Banking (Enable Banking, GoCardless). In hosted mode app.ts answers 403 before these routes.
import { Router } from "express";
import type { SyncResult, Transaction } from "../../shared/types.ts";
import { enableBankingCallback, enableBankingStatus, listAspsps, saveEnableBankingKeys, startEnableBanking, syncEnableBanking } from "../banking/enablebanking.ts";
import { connectionStatus, listInstitutions, saveGoCardlessSecrets, startConnection, syncAccounts } from "../banking/gocardless.ts";
import { insertTransactions, listAccounts } from "../db/index.ts";
import { frontendUrl } from "../runtime.ts";
import { route, text } from "./http.ts";

export const bankRoutes = Router();

function sync(fetchAll: () => Promise<{ imported: Transaction[]; accounts: number }>) {
  return route("Synchronizacja nie powiodła się", async (): Promise<SyncResult> => {
    const { imported, accounts } = await fetchAll();
    return { ...insertTransactions(imported), accounts, total: imported.length };
  });
}

bankRoutes.get(
  "/bank/status",
  route("Nie wczytano stanu połączenia", () => ({
    gocardless: connectionStatus(),
    enablebanking: enableBankingStatus(),
    accounts: listAccounts().filter((account) => account.provider),
  })),
);

bankRoutes.post(
  "/bank/gocardless/secrets",
  route("Nie zapisano kluczy", (req) => {
    saveGoCardlessSecrets(text(req.body?.secretId), text(req.body?.secretKey));
    return { ok: true };
  }),
);

bankRoutes.get(
  "/bank/gocardless/institutions",
  route("Nie pobrano listy banków", async () => ({ institutions: await listInstitutions() })),
);

bankRoutes.post(
  "/bank/gocardless/connect",
  route("Nie udało się rozpocząć połączenia", (req) =>
    startConnection({
      redirect: `${frontendUrl(req.get("origin") || "")}/?bank=connected&provider=gocardless`,
      sandbox: Boolean(req.body?.sandbox),
      institutionId: text(req.body?.institutionId) || undefined,
      institutionName: text(req.body?.institutionName) || undefined,
    }),
  ),
);

bankRoutes.post("/bank/gocardless/sync", sync(syncAccounts));

bankRoutes.post(
  "/bank/enablebanking/keys",
  route("Nie zapisano kluczy", (req) => {
    saveEnableBankingKeys(text(req.body?.appId), text(req.body?.privateKey));
    return { ok: true };
  }),
);

bankRoutes.get(
  "/bank/enablebanking/aspsps",
  route("Nie pobrano listy banków", async () => ({ aspsps: await listAspsps() })),
);

bankRoutes.post(
  "/bank/enablebanking/connect",
  route("Nie udało się rozpocząć połączenia", (req) =>
    startEnableBanking({ aspsp: text(req.body?.aspsp), returnTo: frontendUrl(req.get("origin") || "") }),
  ),
);

bankRoutes.get("/bank/enablebanking/callback", async (req, res) => {
  res.redirect(await enableBankingCallback(req.query));
});

bankRoutes.post("/bank/enablebanking/sync", sync(syncEnableBanking));
