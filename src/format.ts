// Display formatting — pl-PL, złoty. Use these instead of formatting numbers and dates inline.
import { parseIso } from "./modules/shared/dates.ts";
import type { Transaction } from "./types";

export function money(value: number, currency = "PLN"): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function roundMoney(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function compactMoney(value: number): string {
  return `${new Intl.NumberFormat("pl-PL", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value)} zł`;
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
}

/** "+12,5%" / "−3%" change of `value` against `base`. */
export function signedPercent(value: number, base: number): string {
  return `${value > 0 ? "+" : ""}${percent(value, base)}`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const label = new Date(year, m - 1, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const MONTHS_SHORT = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];

export function shortMonthTick(month: string): string {
  const [year, m] = month.split("-");
  if (!year || !m) return month;
  return `${m}.${year.slice(2)}`;
}

export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

export function formatDay(iso: string, withYear = true): string {
  return parseIso(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function rangeLabel(from: string, to: string): string {
  if (!from || !to) return "";
  return `${formatDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${formatDay(to)}`;
}

export const WEEKDAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

export const WEEKDAY_NAMES = ["Poniedziałki", "Wtorki", "Środy", "Czwartki", "Piątki", "Soboty", "Niedziele"];

/** Who the payment is with, as shown in lists. */
export function txName(tx: Pick<Transaction, "payee" | "type">): string {
  return tx.payee || tx.type || "Operacja";
}

/** Name used in "all from this payee" prompts. */
export function txWho(tx: Pick<Transaction, "payee" | "title" | "type">): string {
  return tx.payee || tx.title || tx.type || "";
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function bankLabel(banks: { id: string; name: string }[], id: string): string {
  return banks.find((bank) => bank.id === id)?.name || id;
}
