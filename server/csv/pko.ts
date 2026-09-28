// PKO BP: description details sit in the following, unnamed columns ("Tytuł:", "Lokalizacja: …", "Nazwa odbiorcy:").
import type { Transaction } from "../../shared/types.ts";
import { capture, clean, isReferenceTitle, normalizeHeader, parseAmount, parseDate } from "./cells.ts";
import type { Drafter } from "./draft.ts";
import { headerIndexOf } from "./profiles.ts";

export function parsePkoRows(rows: string[][], headerIndex: number, draft: Drafter): Transaction[] {
  const headers = rows[headerIndex].map((cell) => String(cell || "").trim());
  const normalized = headers.map(normalizeHeader);
  const col = (keys: string[]) => headerIndexOf(normalized, keys);
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
    const amount = parseAmount(at(idx.amount));
    if (!dateRaw || amount === null) continue;
    const description = [at(idx.description), ...extras].filter(Boolean).join("\n");
    const blob = description.replace(/\r/g, "");
    const sender = capture(blob, /Nazwa nadawcy:\s*(.+)/i);
    const receiver = capture(blob, /Nazwa odbiorcy:\s*(.+)/i);
    const address = capture(blob, /Adres:\s*(.+)/i)
      .replace(/\s+Miasto:.*$/i, "")
      .replace(/\s+Kraj:.*$/i, "")
      .trim();
    const city = capture(blob, /Miasto:\s*(.+)/i).replace(/\s+Kraj:.*$/i, "").trim();
    const titleRaw = capture(blob, /Tytu[łl]:\s*(.+)/i);
    const payee = [sender, receiver, address].map(clean).find(Boolean) || "";
    const title = titleRaw && !isReferenceTitle(titleRaw) ? titleRaw : city;
    const operationDate = parseDate(dateRaw);
    if (!operationDate) continue;
    transactions.push(
      draft({
        date: parseDate(at(idx.valueDate) || dateRaw) || operationDate,
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
