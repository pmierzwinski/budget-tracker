// /api/bank/* — the bank connection needs the server: app keys stay here, and the bank redirects back here.
import { Router, type Request, type RequestHandler } from "express";
import type { BankServerStatus } from "../../shared/types.ts";
import type { Runtime } from "../Runtime.ts";
import { BankSettings } from "./BankSettings.ts";
import { EnableBanking } from "./EnableBanking.ts";
import { GoCardless } from "./GoCardless.ts";

/** The answer goes back as JSON; a thrown error becomes 400 `{ error }`. */
function handle(fallback: string, handler: (req: Request) => unknown): RequestHandler {
  return async (req, res) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : fallback });
    }
  };
}

const text = (value: unknown) => String(value || "");

export function bankRoutes(runtime: Runtime): Router {
  const settings = new BankSettings(runtime.appRoot);
  const enableBanking = new EnableBanking(settings, runtime);
  const goCardless = new GoCardless(settings, runtime);
  const router = Router();

  router.get(
    "/status",
    handle("Nie wczytano stanu połączenia", (): BankServerStatus => ({ gocardless: goCardless.status(), enablebanking: enableBanking.status() })),
  );

  router.post(
    "/gocardless/secrets",
    handle("Nie zapisano kluczy", (req) => {
      goCardless.saveSecrets(text(req.body?.secretId), text(req.body?.secretKey));
      return { ok: true };
    }),
  );
  router.get("/gocardless/institutions", handle("Nie pobrano listy banków", async () => ({ institutions: await goCardless.listInstitutions() })));
  router.post(
    "/gocardless/connect",
    handle("Nie udało się rozpocząć połączenia", (req) =>
      goCardless.start({
        redirect: `${runtime.frontendUrl(req.get("origin") || "")}/?bank=connected&provider=gocardless`,
        sandbox: Boolean(req.body?.sandbox),
        institutionId: text(req.body?.institutionId) || undefined,
        institutionName: text(req.body?.institutionName) || undefined,
      }),
    ),
  );
  router.post("/gocardless/fetch", handle("Synchronizacja nie powiodła się", () => goCardless.fetchTransactions()));

  router.post(
    "/enablebanking/keys",
    handle("Nie zapisano kluczy", (req) => {
      enableBanking.saveKeys(text(req.body?.appId), text(req.body?.privateKey));
      return { ok: true };
    }),
  );
  router.get("/enablebanking/aspsps", handle("Nie pobrano listy banków", async () => ({ aspsps: await enableBanking.listAspsps() })));
  router.post(
    "/enablebanking/connect",
    handle("Nie udało się rozpocząć połączenia", (req) =>
      enableBanking.start(text(req.body?.aspsp), runtime.frontendUrl(req.get("origin") || "")),
    ),
  );
  router.get("/enablebanking/callback", async (req, res) => {
    res.redirect(await enableBanking.callback(req.query));
  });
  router.post(
    "/enablebanking/fetch",
    handle("Synchronizacja nie powiodła się", (req) =>
      enableBanking.fetchTransactions(Array.isArray(req.body?.known) ? req.body.known.map(String) : []),
    ),
  );

  return router;
}
