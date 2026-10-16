import type { Router } from "express";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { MetaService } from "./MetaService.ts";

export class AppController extends Controller {
  readonly #meta: MetaService;

  constructor(meta: MetaService) {
    super();
    this.#meta = meta;
  }

  register(router: Router): void {
    router.get(
      "/meta",
      this.handle("Nie wczytano danych", (req) => this.#meta.meta(RequestReader.account(req.query.account))),
    );
  }
}
