// CSV statements from Polish banks: `parseStatement(bytes, { bank?, categorize })` → { bank, iban, items }.
import Papa from "papaparse";
import type { Transaction } from "../../../../shared/types";
import { hashId } from "../../../../shared/sha256";
import { newTransaction } from "../../payments/transactions";
import { BANKS, type BankId } from "./banks";
import { Cells } from "./Cells";
import { HeaderRow } from "./ColumnProfiles";
import { ColumnProfileFormat, PkoFormat, SantanderHeaderlessFormat } from "./formats";

export type ParsedFile = { bank: BankId; iban: string; items: Transaction[] };

type Categorize = (tx: { payee: string; title: string; description: string; type: string; amount: number }) => string;

/** `bank` forces a profile when the headers don't identify the bank; items have no account yet. */
export function parseStatement(bytes: Uint8Array, options: { bank?: string; categorize: Categorize }): ParsedFile {
  const text = Cells.decode(bytes);
  const parsed = Papa.parse<string[]>(text, { delimiter: Cells.detectDelimiter(text), skipEmptyLines: "greedy" });
  const rows = parsed.data.filter((row) => row.some((cell) => String(cell || "").trim()));
  const now = new Date().toISOString();
  const drafter = (bank: BankId) => new TransactionDrafter(bank, options.categorize, now);
  const requested = BANKS.some((bank) => bank.id === options.bank) ? (options.bank as BankId) : undefined;

  const headerIndex = rows.slice(0, 60).findIndex(HeaderRow.isHeader);
  let result: ParsedFile;
  if (headerIndex < 0) {
    if (!SantanderHeaderlessFormat.matches(rows)) {
      throw new Error("Nie rozpoznano nagłówków wyciągu. Upewnij się, że to eksport historii w CSV z bankowości.");
    }
    const { items, iban } = new SantanderHeaderlessFormat().parse(rows, drafter("santander"));
    result = { bank: "santander", iban, items };
  } else {
    const raw = rows[headerIndex].map((cell) => String(cell || ""));
    const detected = HeaderRow.detectBank(raw, raw.map(Cells.normalizeHeader));
    const bank = requested && requested !== "generic" && detected === "generic" ? requested : detected;
    const preamble = rows
      .slice(0, headerIndex)
      .map((row) => row.join(" "))
      .join("\n");
    const iban = Cells.findIban(preamble);
    const format = bank === "pko" ? new PkoFormat() : new ColumnProfileFormat(bank);
    const items = format.parse(rows, headerIndex, iban, drafter(bank));
    result = { bank: requested && detected === "generic" ? requested : bank, iban, items };
  }

  if (!result.items.length) throw new Error("W pliku nie znaleziono żadnych zaksięgowanych transakcji.");
  return result;
}

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
  readonly #categorize: Categorize;
  readonly #now: string;
  readonly #seen = new Map<string, number>();

  constructor(bank: BankId, categorize: Categorize, now: string) {
    this.#bank = bank;
    this.#categorize = categorize;
    this.#now = now;
  }

  draft(row: DraftRow): Transaction {
    const prefix = this.#bank === "pko" ? "csv" : this.#bank;
    const baseId = hashId([prefix, row.bookingDate, String(row.amount), row.payee, row.title, row.type, row.description.slice(0, 120)]);
    const repeat = this.#seen.get(baseId) ?? 0;
    this.#seen.set(baseId, repeat + 1);
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
      category: this.#categorize(row),
      source: "csv",
      externalId: `csv:${id}`,
      createdAt: this.#now,
    });
  }
}
