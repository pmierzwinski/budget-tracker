import type { Router } from "express";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { AccountService } from "./AccountService.ts";

export class AccountsController extends Controller {
  readonly #accounts: AccountService;

  constructor(accounts: AccountService) {
    super();
    this.#accounts = accounts;
  }

  register(router: Router): void {
    router.get(
      "/accounts",
      this.handle("Nie wczytano kont", () => ({ accounts: this.#accounts.list() })),
    );

    router.post(
      "/accounts",
      this.handle("Nie dodano konta", (req) => {
        const account = this.#accounts.create({
          name: RequestReader.text(req.body?.name),
          bank: String(req.body?.bank || "generic"),
          iban: RequestReader.text(req.body?.iban),
        });
        return { account, accounts: this.#accounts.list() };
      }),
    );

    router.patch(
      "/accounts/:id",
      this.handle("Nie zapisano konta", (req) => {
        const account = this.#accounts.update(String(req.params.id), {
          name: req.body?.name != null ? String(req.body.name) : undefined,
          iban: req.body?.iban != null ? String(req.body.iban) : undefined,
        });
        return { account, accounts: this.#accounts.list() };
      }),
    );

    router.delete(
      "/accounts/:id",
      this.handle("Nie usunięto konta", (req) => ({
        removed: this.#accounts.delete(String(req.params.id)),
        accounts: this.#accounts.list(),
      })),
    );
  }
}
