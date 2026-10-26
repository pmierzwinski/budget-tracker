// Domain rules used on both sides: categories, recurring payments, limits, amount buckets, grouping keys.
import { round2 } from "./numbers.ts";
import type { AmountBucket, LimitStatus, RecurringPayment, RecurringStatus, TxSort } from "./types.ts";

/** Uncategorized payments. Cannot be removed or renamed and is always listed last. */
export const DEFAULT_CATEGORY = "Inne";

export const BUILTIN_CATEGORIES = [
  "Spożywcze",
  "Jedzenie na mieście",
  "Paliwo",
  "Transport",
  "Rachunki",
  "Mieszkanie",
  "Zdrowie",
  "Odzież",
  "Rozrywka",
  "Subskrypcje",
  "Inwestycje",
  "Finanse",
  "Przelewy",
  "Wynagrodzenie",
  "Inne",
] as const;

export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export function isBuiltinCategory(name: string): name is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(name);
}

export const TX_SORTS: TxSort[] = ["date_desc", "date_asc", "amount_desc", "amount_asc", "category_asc", "category_desc"];

export const RECURRING_STATUSES: RecurringStatus[] = ["auto", "active", "ended", "hidden"];

/** New (unreviewed) first, then confirmed active, ended, and "not recurring" at the very bottom. */
export const RECURRING_ORDER: Record<RecurringStatus, number> = { auto: 0, active: 1, ended: 2, hidden: 3 };

export function compareRecurring(a: RecurringPayment, b: RecurringPayment): number {
  return (
    RECURRING_ORDER[a.status] - RECURRING_ORDER[b.status] ||
    Number(b.active) - Number(a.active) ||
    b.amount - a.amount
  );
}

export function limitStatus(ratio: number): LimitStatus {
  return ratio > 1.001 ? "over" : ratio >= 0.85 ? "warn" : "ok";
}

export const DEFAULT_AMOUNT_THRESHOLDS = [100, 200, 300, 500];

export const MAX_AMOUNT_THRESHOLDS = 9;

function formatZl(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

/** Amount buckets built from thresholds; `max` is exclusive, the last bucket is open-ended. */
export function amountBucketDefs(thresholds: number[]): Omit<AmountBucket, "amount" | "count">[] {
  const buckets: Omit<AmountBucket, "amount" | "count">[] = [];
  let min = 0;
  for (const max of thresholds) {
    buckets.push({
      id: `${min}-${max}`,
      label: min === 0 ? `<${formatZl(max)} zł` : `${formatZl(min)}–${formatZl(max)} zł`,
      min,
      max,
    });
    min = max;
  }
  buckets.push({ id: `${min}-`, label: `>${formatZl(min)} zł`, min, max: null });
  return buckets;
}

/** Transaction filter matching one amount bucket (the API's maxAmount is inclusive). */
export function bucketQuery(bucket?: { min: number; max: number | null }): { minAmount?: string; maxAmount?: string } {
  if (!bucket) return {};
  return {
    ...(bucket.min > 0 ? { minAmount: String(bucket.min) } : {}),
    ...(bucket.max != null ? { maxAmount: String(round2(bucket.max - 0.01)) } : {}),
  };
}

type Named = { payee: string; title: string; type: string };

/** Display name of the other side of a payment. */
export function payeeLabel(tx: Named): string {
  return (tx.payee || tx.title || tx.type || "Operacja").replace(/\s+/g, " ").trim();
}

/** Phrase used for "all from this payee" rules: the first meaningful word of the payee. */
export function suggestPattern(text: string): string {
  const cleaned = text
    .replace(/^www\./i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  const token = cleaned.split(/[\s,/|]+/).find((part) => part.replace(/[.\d]/g, "").length >= 3);
  return (token || cleaned).slice(0, 40);
}

export function merchantPattern(tx: Named): string {
  return suggestPattern(tx.payee || tx.title || tx.type);
}

/** Key under which an AI evaluation of a view (period + filters + account) is stored. */
export function evaluationKey(view: {
  from?: string;
  to?: string;
  category?: string;
  kind?: string;
  minAmount?: string;
  maxAmount?: string;
  account?: string;
}): string {
  const parts = [
    view.from || "",
    view.to || "",
    view.category || "",
    view.kind && view.kind !== "all" ? view.kind : "",
    view.minAmount || "",
    view.maxAmount || "",
  ];
  if (view.account) parts.push(view.account);
  return parts.join("|");
}

/** The Windows installer, attached to a GitHub release. The web build links here. */
export const DOWNLOAD_FILE = "Wydatki-Setup.exe";
export const RELEASE_DOWNLOAD_URL = `https://github.com/pmierzwinski/budget-tracker/releases/latest/download/${DOWNLOAD_FILE}`;
