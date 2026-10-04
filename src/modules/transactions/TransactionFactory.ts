// Builds new transactions — shared by CSV import, Open Banking sync and demo data.
import { createHash } from "node:crypto";
import type { Transaction } from "../shared/types.ts";

type Required = "id" | "date" | "bookingDate" | "amount" | "type" | "payee" | "title" | "description" | "accountId";

export type NewTransaction = Pick<Transaction, Required | "category" | "source" | "externalId"> &
  Partial<Pick<Transaction, "currency" | "accountIban" | "createdAt">>;

export class TransactionFactory {
  /** Stable 24-char id from parts. Changing how ids are built duplicates history on re-import. */
  static hashId(parts: (string | number)[]): string {
    return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
  }

  /** Today (UTC) shifted by `offsetDays`, as YYYY-MM-DD. */
  static utcDay(offsetDays = 0): string {
    return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  static create(input: NewTransaction): Transaction {
    return {
      id: input.id,
      date: input.date,
      bookingDate: input.bookingDate,
      amount: input.amount,
      currency: input.currency || "PLN",
      type: input.type,
      payee: input.payee,
      title: input.title,
      description: input.description,
      accountIban: input.accountIban || "",
      accountId: input.accountId,
      category: input.category,
      comment: "",
      excluded: false,
      manualCategory: false,
      source: input.source,
      externalId: input.externalId,
      createdAt: input.createdAt || new Date().toISOString(),
    };
  }
}
