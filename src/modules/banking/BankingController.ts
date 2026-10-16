// Open Banking (Enable Banking, GoCardless). Server only — the web version has no bank connection.
import type { Router } from "express";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { Runtime } from "../core/Runtime.ts";
import type { BankingService } from "./BankingService.ts";

const { text } = RequestReader;

export class BankingController extends Controller {
  readonly #banking: BankingService;
  readonly #runtime: Runtime;

  constructor(banking: BankingService, runtime: Runtime) {
    super();
    this.#banking = banking;
    this.#runtime = runtime;
  }

  register(router: Router): void {
    const { enableBanking, goCardless } = this.#banking;

    router.get(
      "/bank/status",
      this.handle("Nie wczytano stanu połączenia", () => this.#banking.status()),
    );

    router.post(
      "/bank/gocardless/secrets",
      this.handle("Nie zapisano kluczy", (req) => {
        goCardless.saveSecrets(text(req.body?.secretId), text(req.body?.secretKey));
        return { ok: true };
      }),
    );

    router.get(
      "/bank/gocardless/institutions",
      this.handle("Nie pobrano listy banków", async () => ({ institutions: await goCardless.listInstitutions() })),
    );

    router.post(
      "/bank/gocardless/connect",
      this.handle("Nie udało się rozpocząć połączenia", (req) =>
        goCardless.start({
          redirect: `${this.#runtime.frontendUrl(req.get("origin") || "")}/?bank=connected&provider=gocardless`,
          sandbox: Boolean(req.body?.sandbox),
          institutionId: text(req.body?.institutionId) || undefined,
          institutionName: text(req.body?.institutionName) || undefined,
        }),
      ),
    );

    router.post(
      "/bank/gocardless/sync",
      this.handle("Synchronizacja nie powiodła się", () => this.#banking.sync(goCardless)),
    );

    router.post(
      "/bank/enablebanking/keys",
      this.handle("Nie zapisano kluczy", (req) => {
        enableBanking.saveKeys(text(req.body?.appId), text(req.body?.privateKey));
        return { ok: true };
      }),
    );

    router.get(
      "/bank/enablebanking/aspsps",
      this.handle("Nie pobrano listy banków", async () => ({ aspsps: await enableBanking.listAspsps() })),
    );

    router.post(
      "/bank/enablebanking/connect",
      this.handle("Nie udało się rozpocząć połączenia", (req) =>
        enableBanking.start({ aspsp: text(req.body?.aspsp), returnTo: this.#runtime.frontendUrl(req.get("origin") || "") }),
      ),
    );

    router.get("/bank/enablebanking/callback", async (req, res) => {
      res.redirect(await enableBanking.callback(req.query));
    });

    router.post(
      "/bank/enablebanking/sync",
      this.handle("Synchronizacja nie powiodła się", () => this.#banking.sync(enableBanking)),
    );
  }
}
