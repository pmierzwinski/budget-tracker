// Column profiles per bank (normalized header names) and bank detection from headers.
import type { BankId } from "./banks.ts";
import { Cells } from "./Cells.ts";

export type Columns = {
  date: string[];
  valueDate?: string[];
  amount?: string[];
  debit?: string[];
  credit?: string[];
  currency?: string[];
  payee?: string[];
  sender?: string[];
  receiver?: string[];
  title?: string[];
  description?: string[];
  type?: string[];
  counterAccount?: string[];
  status?: string[];
  fee?: string[];
};

export const GENERIC: Columns = {
  date: ["data operacji", "data transakcji", "data rozpoczecia", "started date", "data ksiegowania", "booking date", "data"],
  valueDate: ["data waluty", "data ksiegowania", "data rozliczenia", "data zrealizowania", "completed date", "value date"],
  amount: [
    "kwota w walucie rachunku",
    "kwota transakcji (waluta rachunku)",
    "kwota operacji",
    "kwota transakcji",
    "kwota",
    "amount",
  ],
  debit: ["obciazenia", "obciazenie", "wydatki", "debit"],
  credit: ["uznania", "uznanie", "wplywy", "credit"],
  currency: ["waluta rachunku", "waluta operacji", "waluta", "currency"],
  payee: [
    "dane kontrahenta",
    "nadawca/odbiorca",
    "nadawca / odbiorca",
    "odbiorca/zleceniodawca",
    "nazwa nadawcy/odbiorcy",
    "nazwa kontrahenta",
    "kontrahent",
  ],
  sender: ["nazwa nadawcy", "nadawca"],
  receiver: ["nazwa odbiorcy", "odbiorca"],
  title: ["tytul", "tytulem", "tytul operacji", "tytul przelewu", "title"],
  description: ["opis operacji", "opis transakcji", "szczegoly transakcji", "szczegoly", "opis", "description"],
  type: ["typ transakcji", "typ operacji", "rodzaj transakcji", "rodzaj operacji", "typ", "type"],
  counterAccount: [
    "nr rachunku",
    "numer konta",
    "rachunek nadawcy/odbiorcy",
    "na konto/z konta",
    "rachunek docelowy",
    "rachunek kontrahenta",
  ],
  status: ["stan", "state", "status"],
};

export const PROFILES: Partial<Record<BankId, Columns>> = {
  mbank: {
    ...GENERIC,
    date: ["data operacji", "data ksiegowania"],
    valueDate: ["data ksiegowania"],
    payee: ["nadawca/odbiorca"],
    description: ["opis operacji"],
    title: ["tytul"],
    type: ["kategoria"],
  },
  ing: {
    ...GENERIC,
    date: ["data transakcji"],
    valueDate: ["data ksiegowania"],
    amount: ["kwota transakcji (waluta rachunku)", "kwota platnosci w walucie"],
    payee: ["dane kontrahenta"],
    title: ["tytul"],
    description: ["szczegoly"],
    type: [],
  },
  pekao: {
    ...GENERIC,
    date: ["data ksiegowania"],
    valueDate: ["data waluty"],
    payee: ["nadawca / odbiorca", "nadawca/odbiorca"],
    title: ["tytulem"],
    type: ["typ operacji"],
    counterAccount: ["rachunek docelowy", "rachunek zrodlowy"],
  },
  millennium: {
    ...GENERIC,
    date: ["data transakcji"],
    valueDate: ["data rozliczenia"],
    amount: [],
    payee: ["odbiorca/zleceniodawca"],
    title: ["opis"],
    description: [],
    type: ["rodzaj transakcji"],
    counterAccount: ["na konto/z konta"],
  },
  alior: {
    ...GENERIC,
    date: ["data transakcji"],
    valueDate: ["data ksiegowania"],
    amount: ["kwota w walucie rachunku", "kwota operacji"],
    currency: ["waluta rachunku", "waluta operacji"],
    payee: [],
    description: ["szczegoly transakcji"],
    title: [],
  },
  revolut: {
    date: ["started date", "data rozpoczecia"],
    valueDate: ["completed date", "data zrealizowania", "data zakonczenia"],
    amount: ["amount", "kwota"],
    fee: ["fee", "oplata"],
    currency: ["currency", "waluta"],
    payee: ["description", "opis"],
    type: ["type", "typ"],
    status: ["state", "stan"],
  },
};

/** Questions about a (normalized) header row. */
export class HeaderRow {
  /** Exact match first, then a header that starts with the key; `taken` columns are skipped. */
  static indexOf(headers: string[], keys: string[] | undefined, taken?: Set<number>): number {
    if (!keys?.length) return -1;
    for (const key of keys) {
      const index = headers.findIndex((header, i) => header === key && !taken?.has(i));
      if (index >= 0) return index;
    }
    for (const key of keys) {
      const index = headers.findIndex((header, i) => header.startsWith(`${key} `) && !taken?.has(i));
      if (index >= 0) return index;
    }
    return -1;
  }

  static detectBank(raw: string[], headers: string[]): BankId {
    const has = (key: string) => headers.includes(key);
    const some = (keys: string[]) => keys.some(has);
    if (has("typ transakcji") && has("opis transakcji") && has("data waluty")) return "pko";
    if (has("dane kontrahenta")) return "ing";
    if (some(["started date", "data rozpoczecia"]) && some(["product", "produkt"])) return "revolut";
    if (has("obciazenia") && has("uznania")) return "millennium";
    if (has("tytulem") || has("rachunek zrodlowy")) return "pekao";
    if (has("kwota w walucie rachunku") || (has("nazwa nadawcy") && has("nazwa odbiorcy"))) return "alior";
    if (raw.some((cell) => cell.trim().startsWith("#")) && has("opis operacji")) return "mbank";
    return "generic";
  }

  static isHeader(cells: string[]): boolean {
    const headers = cells.map((cell) => Cells.normalizeHeader(String(cell || "")));
    const hasDate = headers.some((header) => header.startsWith("data") || header.endsWith("date"));
    const hasAmount = headers.some((header) =>
      ["kwota", "amount", "obciazenia", "uznania"].some((key) => header === key || header.startsWith(`${key} `)),
    );
    return hasDate && hasAmount;
  }
}
