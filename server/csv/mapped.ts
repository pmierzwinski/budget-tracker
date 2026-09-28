// Banks described by a column profile, plus Santander's headerless export.
import { round2 } from "../../shared/numbers.ts";
import type { Transaction } from "../../shared/types.ts";
import type { BankId } from "./banks.ts";
import { clean, findIban, normalizeHeader, parseAmount, parseDate, payeeFromText } from "./cells.ts";
import type { Drafter } from "./draft.ts";
import { GENERIC, PROFILES, headerIndexOf } from "./profiles.ts";

export function parseMappedRows(
  bank: BankId,
  rows: string[][],
  headerIndex: number,
  iban: string,
  draft: Drafter,
): Transaction[] {
  const normalized = rows[headerIndex].map((cell) => normalizeHeader(String(cell || "")));
  const map = PROFILES[bank] || GENERIC;
  const taken = new Set<number>();
  const col = (keys?: string[]) => {
    const index = headerIndexOf(normalized, keys, taken);
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

    let amount = parseAmount(at(idx.amount));
    if (amount === null && (idx.debit >= 0 || idx.credit >= 0)) {
      const debit = parseAmount(at(idx.debit));
      const credit = parseAmount(at(idx.credit));
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (amount === null || amount === 0) continue;
    const fee = parseAmount(at(idx.fee));
    if (fee) amount -= Math.abs(fee);
    amount = round2(amount);

    const operationDate = parseDate(at(idx.date) || at(idx.valueDate));
    if (!operationDate) continue;
    const valueDate = parseDate(at(idx.valueDate)) || operationDate;

    const description = [at(idx.description), at(idx.counterAccount) ? `Rachunek: ${at(idx.counterAccount)}` : ""]
      .filter(Boolean)
      .join("\n");
    const sideName = amount < 0 ? at(idx.receiver) || at(idx.sender) : at(idx.sender) || at(idx.receiver);
    const title = clean(at(idx.title));
    const payee =
      clean(at(idx.payee)).slice(0, 120) ||
      clean(sideName).slice(0, 120) ||
      payeeFromText(at(idx.description)) ||
      payeeFromText(title);
    transactions.push(
      draft({
        date: valueDate,
        bookingDate: operationDate,
        amount,
        currency: at(idx.currency) || "PLN",
        type: clean(at(idx.type)),
        payee,
        title: title && title !== payee ? title : "",
        description,
        iban,
      }),
    );
  }
  return transactions;
}

export function parseSantanderHeaderless(rows: string[][], draft: Drafter): { items: Transaction[]; iban: string } {
  let iban = "";
  const transactions: Transaction[] = [];
  for (const cells of rows) {
    const at = (index: number) => String(cells[index] ?? "").trim();
    if (/^[A-Z]{3}$/.test(at(4))) {
      iban = iban || findIban(at(2));
      continue;
    }
    const operationDate = parseDate(at(0));
    const amount = parseAmount(at(5));
    if (!operationDate || amount === null || amount === 0) continue;
    const title = clean(at(2));
    const payee = clean(at(3)) || payeeFromText(title);
    transactions.push(
      draft({
        date: parseDate(at(1)) || operationDate,
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
