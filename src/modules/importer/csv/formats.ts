// Statement formats (Strategy): PKO with unnamed detail columns, banks described by a column profile,
// and Santander's headerless export.
import { round2 } from "../../shared/numbers.ts";
import type { Transaction } from "../../shared/types.ts";
import type { BankId } from "./banks.ts";
import { Cells } from "./Cells.ts";
import { GENERIC, HeaderRow, PROFILES } from "./ColumnProfiles.ts";
import type { TransactionDrafter } from "./TransactionDrafter.ts";

/** Rows below the header row (`headerIndex`) become transactions; `iban` comes from the file preamble. */
export interface StatementFormat {
  parse(rows: string[][], headerIndex: number, iban: string, drafter: TransactionDrafter): Transaction[];
}

/** PKO BP: description details sit in the following, unnamed columns ("Tytuł:", "Lokalizacja: …", "Nazwa odbiorcy:"). */
export class PkoFormat implements StatementFormat {
  parse(rows: string[][], headerIndex: number, _iban: string, drafter: TransactionDrafter): Transaction[] {
    const headers = rows[headerIndex].map((cell) => String(cell || "").trim());
    const normalized = headers.map(Cells.normalizeHeader);
    const col = (keys: string[]) => HeaderRow.indexOf(normalized, keys);
    const idx = {
      date: col(["data operacji"]),
      valueDate: col(["data waluty"]),
      type: col(["typ transakcji"]),
      amount: col(["kwota"]),
      currency: col(["waluta"]),
      description: col(["opis transakcji"]),
    };
    const transactions: Transaction[] = [];
    for (const cells of rows.slice(headerIndex + 1)) {
      const at = (index: number) => (index >= 0 ? String(cells[index] ?? "").trim() : "");
      const extras: string[] = [];
      headers.forEach((header, index) => {
        const value = String(cells[index] ?? "").trim();
        if (value && !header) extras.push(value);
      });
      extras.push(
        ...cells
          .slice(headers.length)
          .map((cell) => String(cell || "").trim())
          .filter(Boolean),
      );
      const type = at(idx.type);
      if (/^blokada$/i.test(type)) continue;
      const dateRaw = at(idx.date) || at(idx.valueDate);
      const amount = Cells.parseAmount(at(idx.amount));
      if (!dateRaw || amount === null) continue;
      const description = [at(idx.description), ...extras].filter(Boolean).join("\n");
      const blob = description.replace(/\r/g, "");
      const sender = Cells.capture(blob, /Nazwa nadawcy:\s*(.+)/i);
      const receiver = Cells.capture(blob, /Nazwa odbiorcy:\s*(.+)/i);
      const address = Cells.capture(blob, /Adres:\s*(.+)/i)
        .replace(/\s+Miasto:.*$/i, "")
        .replace(/\s+Kraj:.*$/i, "")
        .trim();
      const city = Cells.capture(blob, /Miasto:\s*(.+)/i).replace(/\s+Kraj:.*$/i, "").trim();
      const titleRaw = Cells.capture(blob, /Tytu[łl]:\s*(.+)/i);
      const payee = [sender, receiver, address].map(Cells.clean).find(Boolean) || "";
      const title = titleRaw && !Cells.isReferenceTitle(titleRaw) ? titleRaw : city;
      const operationDate = Cells.parseDate(dateRaw);
      if (!operationDate) continue;
      transactions.push(
        drafter.draft({
          date: Cells.parseDate(at(idx.valueDate) || dateRaw) || operationDate,
          bookingDate: operationDate,
          amount,
          currency: at(idx.currency) || "PLN",
          type,
          payee,
          title,
          description,
          iban: "",
        }),
      );
    }
    return transactions;
  }
}

/** A bank described by a column profile (`PROFILES`, `GENERIC` for unknown banks). */
export class ColumnProfileFormat implements StatementFormat {
  readonly #bank: BankId;

  constructor(bank: BankId) {
    this.#bank = bank;
  }

  parse(rows: string[][], headerIndex: number, iban: string, drafter: TransactionDrafter): Transaction[] {
    const normalized = rows[headerIndex].map((cell) => Cells.normalizeHeader(String(cell || "")));
    const map = PROFILES[this.#bank] || GENERIC;
    const taken = new Set<number>();
    const col = (keys?: string[]) => {
      const index = HeaderRow.indexOf(normalized, keys, taken);
      if (index >= 0) taken.add(index);
      return index;
    };
    const idx = {
      date: col(map.date),
      valueDate: col(map.valueDate),
      amount: col(map.amount),
      debit: col(map.debit),
      credit: col(map.credit),
      fee: col(map.fee),
      currency: col(map.currency),
      payee: col(map.payee),
      sender: col(map.sender),
      receiver: col(map.receiver),
      title: col(map.title),
      type: col(map.type),
      counterAccount: col(map.counterAccount),
      status: col(map.status),
      description: col(map.description),
    };
    if (idx.date < 0) idx.date = idx.valueDate;
    if (idx.date < 0 || (idx.amount < 0 && idx.debit < 0 && idx.credit < 0)) {
      throw new Error("Nie znaleziono kolumn z datą i kwotą. Wybierz bank ręcznie albo przyślij przykładowy plik.");
    }

    const transactions: Transaction[] = [];
    for (const cells of rows.slice(headerIndex + 1)) {
      const at = (index: number) => (index >= 0 ? String(cells[index] ?? "").trim() : "");
      const status = at(idx.status);
      if (status && /pend|oczek|revert|cofni|declin|odrzuc|anul|blokad/i.test(status)) continue;
      if (/^blokada$/i.test(at(idx.type))) continue;

      let amount = Cells.parseAmount(at(idx.amount));
      if (amount === null && (idx.debit >= 0 || idx.credit >= 0)) {
        const debit = Cells.parseAmount(at(idx.debit));
        const credit = Cells.parseAmount(at(idx.credit));
        if (debit) amount = -Math.abs(debit);
        else if (credit) amount = Math.abs(credit);
      }
      if (amount === null || amount === 0) continue;
      const fee = Cells.parseAmount(at(idx.fee));
      if (fee) amount -= Math.abs(fee);
      amount = round2(amount);

      const operationDate = Cells.parseDate(at(idx.date) || at(idx.valueDate));
      if (!operationDate) continue;
      const valueDate = Cells.parseDate(at(idx.valueDate)) || operationDate;

      const description = [at(idx.description), at(idx.counterAccount) ? `Rachunek: ${at(idx.counterAccount)}` : ""]
        .filter(Boolean)
        .join("\n");
      const sideName = amount < 0 ? at(idx.receiver) || at(idx.sender) : at(idx.sender) || at(idx.receiver);
      const title = Cells.clean(at(idx.title));
      const payee =
        Cells.clean(at(idx.payee)).slice(0, 120) ||
        Cells.clean(sideName).slice(0, 120) ||
        Cells.payeeFromText(at(idx.description)) ||
        Cells.payeeFromText(title);
      transactions.push(
        drafter.draft({
          date: valueDate,
          bookingDate: operationDate,
          amount,
          currency: at(idx.currency) || "PLN",
          type: Cells.clean(at(idx.type)),
          payee,
          title: title && title !== payee ? title : "",
          description,
          iban,
        }),
      );
    }
    return transactions;
  }
}

/** Santander's export without a header row; the account number sits in a row with a currency code. */
export class SantanderHeaderlessFormat {
  /** Whether the rows look like this export (two dates at the start of a wide row). */
  static matches(rows: string[][]): boolean {
    return rows.some(
      (row) => row.length >= 6 && Cells.parseDate(String(row[0] || "")) && Cells.parseDate(String(row[1] || "")),
    );
  }

  parse(rows: string[][], drafter: TransactionDrafter): { items: Transaction[]; iban: string } {
    let iban = "";
    const transactions: Transaction[] = [];
    for (const cells of rows) {
      const at = (index: number) => String(cells[index] ?? "").trim();
      if (/^[A-Z]{3}$/.test(at(4))) {
        iban = iban || Cells.findIban(at(2));
        continue;
      }
      const operationDate = Cells.parseDate(at(0));
      const amount = Cells.parseAmount(at(5));
      if (!operationDate || amount === null || amount === 0) continue;
      const title = Cells.clean(at(2));
      const payee = Cells.clean(at(3)) || Cells.payeeFromText(title);
      transactions.push(
        drafter.draft({
          date: Cells.parseDate(at(1)) || operationDate,
          bookingDate: operationDate,
          amount,
          currency: "PLN",
          type: "",
          payee,
          title: title !== payee ? title : "",
          description: at(4) ? `Rachunek: ${at(4)}` : "",
          iban,
        }),
      );
    }
    return { items: transactions, iban };
  }
}
