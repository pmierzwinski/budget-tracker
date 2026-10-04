import type { Router } from "express";
import type { TransactionsResult } from "../shared/types.ts";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { TransactionService } from "./TransactionService.ts";

export class TransactionsController extends Controller {
  readonly #transactions: TransactionService;

  constructor(transactions: TransactionService) {
    super();
    this.#transactions = transactions;
  }

  register(router: Router): void {
    router.get(
      "/transactions",
      this.handle("Nie wczytano płatności", (req) => this.#transactions.list(RequestReader.filters(req.query)) satisfies TransactionsResult),
    );

    router.patch(
      "/transactions/:id",
      this.handle("Nie zapisano zmian", (req) => {
        const id = String(req.params.id);
        const body = req.body || {};
        const hasComment = Object.prototype.hasOwnProperty.call(body, "comment");
        const hasExcluded = typeof body.excluded === "boolean";
        const category = RequestReader.text(body.category).trim();
        if (!hasComment && !category && !hasExcluded) throw new Error("Podaj kategorię, komentarz albo ukrycie");
        const comment = hasComment ? this.#transactions.setComment(id, String(body.comment ?? "")) : undefined;
        if (hasExcluded) this.#transactions.setExcluded(id, body.excluded);
        if (!category) return { ok: true, comment, excluded: hasExcluded ? body.excluded : undefined };
        return {
          ok: true,
          comment,
          ...this.#transactions.applyCategory(id, category, {
            onlyThis: body.onlyThis !== false,
            force: body.force === true,
            manual: body.manual !== false,
          }),
        };
      }),
    );
  }
}
