import type { Transaction } from "../../shared/types.ts";
import type { Categorizer } from "../../categories/categorizer/Categorizer.ts";
import { TransactionFactory } from "../../transactions/TransactionFactory.ts";
import type { BankId } from "./banks.ts";

export type DraftRow = {
  date: string;
  bookingDate: string;
  amount: number;
  currency: string;
  type: string;
  payee: string;
  title: string;
  description: string;
  iban: string;
};

/**
 * Turns parsed rows of one file into transactions. The id hashes the row (PKO keeps the historical "csv"
 * prefix); identical rows in one file get a numeric suffix so none is lost, and re-importing skips them.
 */
export class TransactionDrafter {
  readonly #bank: BankId;
  readonly #categorizer: Categorizer;
  readonly #now: string;
  readonly #seen = new Map<string, number>();

  constructor(bank: BankId, categorizer: Categorizer, now = new Date().toISOString()) {
    this.#bank = bank;
    this.#categorizer = categorizer;
    this.#now = now;
  }

  draft(row: DraftRow): Transaction {
    const prefix = this.#bank === "pko" ? "csv" : this.#bank;
    const baseId = TransactionFactory.hashId([
      prefix,
      row.bookingDate,
      String(row.amount),
      row.payee,
      row.title,
      row.type,
      row.description.slice(0, 120),
    ]);
    const repeat = this.#seen.get(baseId) ?? 0;
    this.#seen.set(baseId, repeat + 1);
    const id = repeat ? TransactionFactory.hashId([baseId, String(repeat)]) : baseId;
    return TransactionFactory.create({
      id,
      date: row.date,
      bookingDate: row.bookingDate,
      amount: row.amount,
      currency: row.currency,
      type: row.type,
      payee: row.payee,
      title: row.title,
      description: row.description,
      accountIban: row.iban,
      accountId: "",
      category: this.#categorizer.categorize(row),
      source: "csv",
      externalId: `csv:${id}`,
      createdAt: this.#now,
    });
  }
}
