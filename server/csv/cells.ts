// Cell-level parsing: encoding, separators, headers, amounts, dates and text snippets.
import iconv from "iconv-lite";

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

export function parseAmount(raw: string): number | null {
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

export function parseDate(raw: string): string {
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

export function decodeBuffer(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer, "utf16-le");
  }
  const utf8 = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (!looksLikeMojibake(utf8) && !utf8.includes("\0")) return utf8;
  return iconv.decode(buffer, "win1250");
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLines = text.split(/\r?\n/).slice(0, 40).join("\n");
  const counts = {
    ",": (firstLines.match(/,/g) || []).length,
    ";": (firstLines.match(/;/g) || []).length,
    "\t": (firstLines.match(/\t/g) || []).length,
  };
  if (counts["\t"] > counts[";"] && counts["\t"] > counts[","]) return "\t";
  return counts[";"] > counts[","] ? ";" : ",";
}

export function findIban(text: string): string {
  const match = text.match(/(?:PL)?\s?'?(\d{2}(?:[ ]?\d{4}){6})/);
  return match ? match[1].replace(/\s/g, "") : "";
}

export function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function capture(blob: string, pattern: RegExp): string {
  return blob.match(pattern)?.[1]?.trim() || "";
}

export function isReferenceTitle(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  return compact.length >= 6 && /^[\d'A-Z*]+$/.test(compact);
}

export function payeeFromText(text: string): string {
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
