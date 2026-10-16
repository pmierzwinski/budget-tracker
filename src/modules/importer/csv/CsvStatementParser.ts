// CSV statements from Polish banks: `parse(buffer, { bank?, categorizer })` → { bank, iban, items }.
import Papa from "papaparse";
import type { Transaction } from "../../shared/types.ts";
import type { Categorizer } from "../../categories/categorizer/Categorizer.ts";
import { BANKS, type BankId } from "./banks.ts";
import { Cells } from "./Cells.ts";
import { HeaderRow } from "./ColumnProfiles.ts";
import { ColumnProfileFormat, PkoFormat, SantanderHeaderlessFormat, type StatementFormat } from "./formats.ts";
import { TransactionDrafter } from "./TransactionDrafter.ts";

export type ParsedFile = { bank: BankId; iban: string; items: Transaction[] };

export class CsvStatementParser {
  static formatFor(bank: BankId): StatementFormat {
    return bank === "pko" ? new PkoFormat() : new ColumnProfileFormat(bank);
  }

  /** `bank` forces a profile when the headers don't identify the bank; items have no account yet. */
  parse(buffer: Uint8Array, options: { bank?: string; categorizer: Categorizer }): ParsedFile {
    const text = Cells.decode(buffer);
    const parsed = Papa.parse<string[]>(text, {
      delimiter: Cells.detectDelimiter(text),
      skipEmptyLines: "greedy",
    });
    const rows = parsed.data.filter((row) => row.some((cell) => String(cell || "").trim()));
    const now = new Date().toISOString();
    const drafter = (bank: BankId) => new TransactionDrafter(bank, options.categorizer, now);
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
      const headers = raw.map(Cells.normalizeHeader);
      const detected = HeaderRow.detectBank(raw, headers);
      const bank = requested && requested !== "generic" && detected === "generic" ? requested : detected;
      const preamble = rows
        .slice(0, headerIndex)
        .map((row) => row.join(" "))
        .join("\n");
      const iban = Cells.findIban(preamble);
      const items = CsvStatementParser.formatFor(bank).parse(rows, headerIndex, iban, drafter(bank));
      result = { bank: requested && detected === "generic" ? requested : bank, iban, items };
    }

    if (!result.items.length) {
      throw new Error("W pliku nie znaleziono żadnych zaksięgowanych transakcji.");
    }
    return result;
  }
}
