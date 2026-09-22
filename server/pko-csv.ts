import iconv from "iconv-lite";
import Papa from "papaparse";
import { createHash } from "node:crypto";
import { categorizeWithUserRules, searchText, type CategoryRule } from "./categorize.ts";
import type { Transaction } from "./types.ts";

type RawRow = Record<string, string>;

const DATE_KEYS = ["data operacji", "data księgowania", "data ksiegowania", "data transakcji", "booking date"];
const VALUE_DATE_KEYS = ["data waluty", "value date"];
const TYPE_KEYS = ["typ transakcji", "typ operacji", "typ"];
const AMOUNT_KEYS = ["kwota", "kwota operacji", "amount"];
const CURRENCY_KEYS = ["waluta", "waluta operacji", "currency"];
const DESC_KEYS = ["opis transakcji", "opis operacji", "opis", "szczegóły transakcji", "szczegoly transakcji"];

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").replace(/^#+/, "").trim().toLowerCase();
}

function headerMatches(header: string, key: string): boolean {
  const normalized = normalizeHeader(header);
  return normalized === key || normalized.startsWith(`${key} `);
}

function pick(row: RawRow, keys: string[]): string {
  for (const key of keys) {
    const found = Object.entries(row).find(([header, value]) => headerMatches(header, key) && value.trim());
    if (found) return found[1].trim();
  }
  return "";
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let value = raw.trim();
  const negative = /^\(.*\)$/.test(value) || value.startsWith("-");
  value = value.replace(/[()\s+złPLN]/gi, "").replace("-", "");
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
  return value.slice(0, 10);
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

function detectDelimiter(text: string): "," | ";" {
  const firstLines = text.split(/\r?\n/).slice(0, 8).join("\n");
  const commas = (firstLines.match(/,/g) || []).length;
  const semis = (firstLines.match(/;/g) || []).length;
  return semis > commas ? ";" : ",";
}

function capture(blob: string, pattern: RegExp): string {
  return blob.match(pattern)?.[1]?.trim() || "";
}

function isReferenceTitle(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return compact.length >= 6 && /^[\d'A-Z*]+$/.test(compact);
}

function parseDescription(raw: string): { payee: string; title: string } {
  const blob = raw.replace(/\r/g, "");
  const sender = capture(blob, /Nazwa nadawcy:\s*(.+)/i);
  const receiver = capture(blob, /Nazwa odbiorcy:\s*(.+)/i);
  const address = capture(blob, /Adres:\s*(.+)/i)
    .replace(/\s+Miasto:.*$/i, "")
    .replace(/\s+Kraj:.*$/i, "")
    .trim();
  const city = capture(blob, /Miasto:\s*(.+)/i).replace(/\s+Kraj:.*$/i, "").trim();
  const titleRaw = capture(blob, /Tytu[łl]:\s*(.+)/i);
  const payee =
    [sender, receiver, address]
      .map((item) => item.replace(/\s+/g, " ").trim())
      .find(Boolean) || "";
  const title = titleRaw && !isReferenceTitle(titleRaw) ? titleRaw : city;
  return { payee, title };
}

function hashId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function parsePkoCsv(
  buffer: Buffer,
  source: Transaction["source"] = "csv",
  rules: CategoryRule[] = [],
  blocked: Iterable<string> = [],
): Transaction[] {
  const text = decodeBuffer(buffer);
  const parsed = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(text),
    skipEmptyLines: "greedy",
  });

  const rows = parsed.data.filter((row) => row.some((cell) => String(cell || "").trim()));
  const headerIndex = rows.findIndex((row) => {
    const joined = row.map(normalizeHeader).join(" ");
    return joined.includes("kwota") && joined.includes("data");
  });
  if (headerIndex < 0) {
    throw new Error("Nie rozpoznano nagłówków wyciągu PKO. Upewnij się, że to plik CSV z iPKO.");
  }

  const headers = rows[headerIndex].map((cell) => String(cell || "").trim());
  const now = new Date().toISOString();
  const transactions: Transaction[] = [];
  let skippedPending = 0;
  const seen = new Map<string, number>();

  for (const cells of rows.slice(headerIndex + 1)) {
    const row: RawRow = {};
    const extras: string[] = [];
    headers.forEach((header, index) => {
      const value = String(cells[index] ?? "").trim();
      if (!value) return;
      if (!header) extras.push(value);
      else row[header] = value;
    });
    extras.push(
      ...cells
        .slice(headers.length)
        .map((cell) => String(cell || "").trim())
        .filter(Boolean),
    );

    const type = pick(row, TYPE_KEYS);
    if (/^blokada$/i.test(type)) {
      skippedPending += 1;
      continue;
    }

    const dateRaw = pick(row, DATE_KEYS) || pick(row, VALUE_DATE_KEYS);
    const amountRaw = pick(row, AMOUNT_KEYS);
    if (!dateRaw || !amountRaw) continue;
    const amount = parseAmount(amountRaw);
    if (amount === null) continue;

    const description = [pick(row, DESC_KEYS), ...extras].filter(Boolean).join("\n");
    const parsedDesc = parseDescription(description);
    const payee = parsedDesc.payee;
    const title = parsedDesc.title;
    const operationDate = parseDate(dateRaw);
    const date = parseDate(pick(row, VALUE_DATE_KEYS) || dateRaw);
    const currency = pick(row, CURRENCY_KEYS) || "PLN";
    const draft = { payee, title, description, type };
    const baseId = hashId(["csv", operationDate, String(amount), payee, title, type, description.slice(0, 120)]);
    const repeat = seen.get(baseId) ?? 0;
    seen.set(baseId, repeat + 1);
    const id = repeat ? hashId([baseId, String(repeat)]) : baseId;

    transactions.push({
      id,
      date,
      bookingDate: operationDate,
      amount,
      currency,
      type,
      payee,
      title,
      description,
      accountIban: "",
      category: categorizeWithUserRules(searchText(draft), amount, rules, blocked),
      comment: "",
      source,
      externalId: `csv:${id}`,
      createdAt: now,
    });
  }

  if (!transactions.length) {
    throw new Error(
      skippedPending
        ? "W pliku są tylko blokady (autoryzacje). Poczekaj na zaksięgowane operacje."
        : "W pliku nie znaleziono żadnych transakcji.",
    );
  }

  return transactions;
}
