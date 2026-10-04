// CSV statements from Polish banks: `parseBankCsv(buffer, { bank?, categorize })` → { bank, iban, items }.
import Papa from "papaparse";
import type { Transaction } from "../../../../shared/types.ts";
import type { Categorizer } from "../../categories/categorizer.ts";
import { BANKS, type BankId } from "./banks.ts";
import { decodeBuffer, detectDelimiter, findIban, normalizeHeader, parseDate } from "./cells.ts";
import { createDrafter } from "./draft.ts";
import { parseMappedRows, parseSantanderHeaderless } from "./mapped.ts";
import { parsePkoRows } from "./pko.ts";
import { detectBank, isHeaderRow } from "./profiles.ts";

export { BANKS, bankName, type BankId } from "./banks.ts";

export type ParsedFile = { bank: BankId; iban: string; items: Transaction[] };

/** `bank` forces a profile when the headers don't identify the bank; items have no account yet. */
export function parseBankCsv(buffer: Buffer, options: { bank?: string; categorize: Categorizer }): ParsedFile {
  const text = decodeBuffer(buffer);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data.filter((row) => row.some((cell) => String(cell || "").trim()));
  const now = new Date().toISOString();
  const drafter = (bank: BankId) => createDrafter(bank, options.categorize, now);
  const requested = BANKS.some((bank) => bank.id === options.bank) ? (options.bank as BankId) : undefined;

  const headerIndex = rows.slice(0, 60).findIndex(isHeaderRow);
  let result: ParsedFile;
  if (headerIndex < 0) {
    const looksSantander = rows.some((row) => row.length >= 6 && parseDate(String(row[0] || "")) && parseDate(String(row[1] || "")));
    if (!looksSantander) {
      throw new Error("Nie rozpoznano nagłówków wyciągu. Upewnij się, że to eksport historii w CSV z bankowości.");
    }
    const { items, iban } = parseSantanderHeaderless(rows, drafter("santander"));
    result = { bank: "santander", iban, items };
  } else {
    const raw = rows[headerIndex].map((cell) => String(cell || ""));
    const headers = raw.map(normalizeHeader);
    const detected = detectBank(raw, headers);
    const bank = requested && requested !== "generic" && detected === "generic" ? requested : detected;
    const preamble = rows
      .slice(0, headerIndex)
      .map((row) => row.join(" "))
      .join("\n");
    const iban = findIban(preamble);
    const items =
      bank === "pko"
        ? parsePkoRows(rows, headerIndex, drafter("pko"))
        : parseMappedRows(bank, rows, headerIndex, iban, drafter(bank));
    result = { bank: requested && detected === "generic" ? requested : bank, iban, items };
  }

  if (!result.items.length) {
    throw new Error("W pliku nie znaleziono żadnych zaksięgowanych transakcji.");
  }
  return result;
}
