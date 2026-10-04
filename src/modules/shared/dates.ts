// Date helpers on ISO day strings ("YYYY-MM-DD"), in local time.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const MONTHS_NOMINATIVE = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

export const MONTHS_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isoMonth(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Number of days in a month; `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return `${month}-${pad(daysInMonth(year, m))}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  return isoMonth(new Date(year, m - 1 + delta, 1));
}

/** Months since year 0 — handy for "how many months apart". */
export function monthIndex(iso: string): number {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

/** Days since epoch (UTC), for day differences without DST surprises. */
export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, (month || 1) - 1, day || 1) / DAY_MS);
}

export function isMonthStart(iso: string): boolean {
  return iso.slice(8, 10) === "01";
}

export function isMonthEnd(iso: string): boolean {
  if (!iso) return false;
  return iso === lastDayOfMonth(iso.slice(0, 7));
}

export function isCalendarMonth(from: string, to: string): boolean {
  return Boolean(from && to) && from.slice(0, 7) === to.slice(0, 7) && isMonthStart(from) && isMonthEnd(to);
}
