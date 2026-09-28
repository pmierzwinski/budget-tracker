import iconv from "iconv-lite";
import Papa from "papaparse";
import { createHash } from "node:crypto";
import { categorizeWithUserRules, searchText, type CategoryRule } from "./categorize.ts";
import type { Transaction } from "./types.ts";

export const BANKS = [
  { id: "pko", name: "PKO BP" },
  { id: "mbank", name: "mBank" },
  { id: "ing", name: "ING Bank Śląski" },
  { id: "santander", name: "Santander" },
  { id: "pekao", name: "Pekao SA" },
  { id: "millennium", name: "Millennium" },
  { id: "alior", name: "Alior Bank" },
  { id: "revolut", name: "Revolut" },
  { id: "credit_agricole", name: "Credit Agricole" },
  { id: "generic", name: "Inny bank" },
] as const;

export type BankId = (typeof BANKS)[number]["id"];

export function bankName(id: string): string {
  return BANKS.find((bank) => bank.id === id)?.name || id;
}

export type ParsedFile = { bank: BankId; iban: string; items: Transaction[] };

type ParseOptions = {
  bank?: string;
  source?: Transaction["source"];
  accountId?: string;
  rules?: CategoryRule[];
  blocked?: Iterable<string>;
};

type Columns = {
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

const GENERIC: Columns = {
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

const PROFILES: Partial<Record<BankId, Columns>> = {
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

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let value = raw.trim();
  const negative = /^\(.*\)$/.test(value) || /^[-−–]/.test(value);
  value = value.replace(/[()\s\u00a0+'złPLNEURUSDGBPCHF]/gi, "").replace(/^[-−–]/, "");
  if (!value) return null;
  if (value.includes(",") && value.includes(".")) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  }
  const amount = Number(value);
  if (Number.isNaN(amount)) return null;
  return negative ? -Math.abs(amount) : amount;
}

function parseDate(raw: string): string {
  const value = raw.trim();
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = value.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const pl = value.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (pl) return `${pl[3]}-${pl[2].padStart(2, "0")}-${pl[1].padStart(2, "0")}`;
  return "";
}

function looksLikeMojibake(text: string): boolean {
  return /[³œŸæ³¼±¶]/i.test(text) || (text.match(/\uFFFD/g) || []).length > 0;
}

function decodeBuffer(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer, "utf16-le");
  }
  const utf8 = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!looksLikeMojibake(utf8) && !utf8.includes("\0")) return utf8;
  return iconv.decode(buffer, "win1250");
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLines = text.split(/\r?\n/).slice(0, 40).join("\n");
  const counts = {
    ",": (firstLines.match(/,/g) || []).length,
    ";": (firstLines.match(/;/g) || []).length,
    "\t": (firstLines.match(/\t/g) || []).length,
  };
  if (counts["\t"] > counts[";"] && counts["\t"] > counts[","]) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

function hashId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function findIban(text: string): string {
  const match = text.match(/(?:PL)?\s?'?(\d{2}(?:[ ]?\d{4}){6})/);
  return match ? match[1].replace(/\s/g, "") : "";
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capture(blob: string, pattern: RegExp): string {
  return blob.match(pattern)?.[1]?.trim() || "";
}

function isReferenceTitle(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return compact.length >= 6 && /^[\d'A-Z*]+$/.test(compact);
}

function payeeFromText(text: string): string {
  const first = text
    .split(/\n| {2,}/)
    .map((part) => part.trim())
    .find((part) => part && !/^(data transakcji|numer karty|nr karty|oryg\. kwota)/i.test(part));
  return clean(
    (first || "")
      .replace(/DATA TRANSAKCJI:.*$/i, "")
      .replace(/^(ZAKUP PRZY UŻYCIU KARTY|PŁATNOŚĆ KARTĄ|TRANSAKCJA KARTĄ|Płatność BLIK|BLIK)\s*[-:]?\s*/i, ""),
  ).slice(0, 120);
}

function draftTransaction(
  input: {
    bank: BankId;
    date: string;
    bookingDate: string;
    amount: number;
    currency: string;
    type: string;
    payee: string;
    title: string;
    description: string;
    iban: string;
  },
  options: ParseOptions,
  seen: Map<string, number>,
  now: string,
): Transaction {
  const parts =
    input.bank === "pko"
      ? ["csv", input.bookingDate, String(input.amount), input.payee, input.title, input.type, input.description.slice(0, 120)]
      : [input.bank, input.bookingDate, String(input.amount), input.payee, input.title, input.type, input.description.slice(0, 120)];
  const baseId = hashId(parts);
  const repeat = seen.get(baseId) ?? 0;
  seen.set(baseId, repeat + 1);
  const id = repeat ? hashId([baseId, String(repeat)]) : baseId;
  const draft = { payee: input.payee, title: input.title, description: input.description, type: input.type };
  return {
    id,
    date: input.date,
    bookingDate: input.bookingDate,
    amount: input.amount,
    currency: input.currency || "PLN",
    type: input.type,
    payee: input.payee,
    title: input.title,
    description: input.description,
    accountIban: input.iban,
    accountId: options.accountId || "",
    category: categorizeWithUserRules(searchText(draft), input.amount, options.rules || [], options.blocked || []),
    comment: "",
    excluded: false,
    source: options.source || "csv",
    externalId: `csv:${id}`,
    createdAt: now,
  };
}

function headerIndexOf(headers: string[], keys: string[] | undefined, taken?: Set<number>): number {
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

function detectBank(raw: string[], headers: string[]): BankId {
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

function isHeaderRow(cells: string[]): boolean {
  const headers = cells.map((cell) => normalizeHeader(String(cell || "")));
  const hasDate = headers.some((header) => header.startsWith("data") || header.endsWith("date"));
  const hasAmount = headers.some((header) =>
    ["kwota", "amount", "obciazenia", "uznania"].some((key) => header === key || header.startsWith(`${key} `)),
  );
  return hasDate && hasAmount;
}

function parsePkoRows(rows: string[][], headerIndex: number, options: ParseOptions, now: string): Transaction[] {
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
  const seen = new Map<string, number>();
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
      draftTransaction(
        {
          bank: "pko",
          date: parseDate(at(idx.valueDate) || dateRaw) || operationDate,
          bookingDate: operationDate,
          amount,
          currency: at(idx.currency) || "PLN",
          type,
          payee,
          title,
          description,
          iban: "",
        },
        options,
        seen,
        now,
      ),
    );
  }
  return transactions;
}

function parseMappedRows(
  bank: BankId,
  rows: string[][],
  headerIndex: number,
  options: ParseOptions,
  now: string,
  iban: string,
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
  const seen = new Map<string, number>();
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
    amount = Math.round(amount * 100) / 100;

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
      draftTransaction(
        {
          bank,
          date: valueDate,
          bookingDate: operationDate,
          amount,
          currency: at(idx.currency) || "PLN",
          type: clean(at(idx.type)),
          payee,
          title: title && title !== payee ? title : "",
          description,
          iban,
        },
        options,
        seen,
        now,
      ),
    );
  }
  return transactions;
}

function parseSantanderHeaderless(rows: string[][], options: ParseOptions, now: string): { items: Transaction[]; iban: string } {
  let iban = "";
  const transactions: Transaction[] = [];
  const seen = new Map<string, number>();
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
      draftTransaction(
        {
          bank: "santander",
          date: parseDate(at(1)) || operationDate,
          bookingDate: operationDate,
          amount,
          currency: "PLN",
          type: "",
          payee,
          title: title !== payee ? title : "",
          description: at(4) ? `Rachunek: ${at(4)}` : "",
          iban,
        },
        options,
        seen,
        now,
      ),
    );
  }
  return { items: transactions, iban };
}

export function parseBankCsv(buffer: Buffer, options: ParseOptions = {}): ParsedFile {
  const text = decodeBuffer(buffer);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: "greedy",
  });
  const rows = parsed.data.filter((row) => row.some((cell) => String(cell || "").trim()));
  const now = new Date().toISOString();
  const requested = BANKS.some((bank) => bank.id === options.bank) ? (options.bank as BankId) : undefined;

  const headerIndex = rows.slice(0, 60).findIndex(isHeaderRow);
  let result: ParsedFile;
  if (headerIndex < 0) {
    const looksSantander = rows.some((row) => row.length >= 6 && parseDate(String(row[0] || "")) && parseDate(String(row[1] || "")));
    if (!looksSantander) {
      throw new Error("Nie rozpoznano nagłówków wyciągu. Upewnij się, że to eksport historii w CSV z bankowości.");
    }
    const { items, iban } = parseSantanderHeaderless(rows, options, now);
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
      bank === "pko" ? parsePkoRows(rows, headerIndex, options, now) : parseMappedRows(bank, rows, headerIndex, options, now, iban);
    result = { bank: requested && detected === "generic" ? requested : bank, iban, items };
  }

  if (!result.items.length) {
    throw new Error("W pliku nie znaleziono żadnych zaksięgowanych transakcji.");
  }
  return result;
}
