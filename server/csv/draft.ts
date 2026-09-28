import type { Transaction } from "../../shared/types.ts";
import type { Categorizer } from "../categorize.ts";
import { hashId, newTransaction } from "../transaction.ts";
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

export type Drafter = (row: DraftRow) => Transaction;

/**
 * Turns parsed rows of one file into transactions. The id hashes the row (PKO keeps the historical "csv"
 * prefix); identical rows in one file get a numeric suffix so none is lost, and re-importing skips them.
 */
export function createDrafter(bank: BankId, categorize: Categorizer, now = new Date().toISOString()): Drafter {
  const seen = new Map<string, number>();
  return (row) => {
    const prefix = bank === "pko" ? "csv" : bank;
    const baseId = hashId([prefix, row.bookingDate, String(row.amount), row.payee, row.title, row.type, row.description.slice(0, 120)]);
    const repeat = seen.get(baseId) ?? 0;
    seen.set(baseId, repeat + 1);
    const id = repeat ? hashId([baseId, String(repeat)]) : baseId;
    return newTransaction({
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
      category: categorize(row),
      source: "csv",
      externalId: `csv:${id}`,
      createdAt: now,
    });
  };
}
