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

export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const label = new Date(year, m - 1, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split("-").map(Number);
  const from = isoDate(new Date(year, m - 1, 1));
  const to = isoDate(new Date(year, m, 0));
  return { from, to };
}

const MONTHS_NOMINATIVE = [
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

const MONTHS_GENITIVE = [
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

export const MONTHS_SHORT = ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"];

function parseIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(iso: string, delta: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

export function dayCount(period: { from: string; to: string }): number {
  return Math.round((parseIso(period.to).getTime() - parseIso(period.from).getTime()) / 86_400_000) + 1;
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

export function isMonthStart(iso: string): boolean {
  return iso.slice(8, 10) === "01";
}

export function isMonthEnd(iso: string): boolean {
  if (!iso) return false;
  const [year, month] = iso.split("-").map(Number);
  return iso === isoDate(new Date(year, month, 0));
}

export function evaluationKey(
  period: { from: string; to: string },
  filters?: { category?: string; kind?: string; minAmount?: string; maxAmount?: string },
  account?: string,
): string {
  const parts = [
    period.from || "",
    period.to || "",
    filters?.category || "",
    filters?.kind && filters.kind !== "all" ? filters.kind : "",
    filters?.minAmount || "",
    filters?.maxAmount || "",
  ];
  if (account) parts.push(account);
  return parts.join("|");
}

export function monthSpan(period: { from: string; to: string }): number {
  if (!period.from || !period.to || !isMonthStart(period.from) || !isMonthEnd(period.to)) return 0;
  const [fromYear, fromMonth] = period.from.split("-").map(Number);
  const [toYear, toMonth] = period.to.split("-").map(Number);
  return Math.max(0, (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1);
}

export function stepPeriod(period: { from: string; to: string }, delta: number): { from: string; to: string } {
  const span = monthSpan(period);
  if (span) {
    return {
      from: monthRange(shiftMonth(period.from.slice(0, 7), delta * span)).from,
      to: monthRange(shiftMonth(period.to.slice(0, 7), delta * span)).to,
    };
  }
  const days = dayCount(period);
  return { from: addDays(period.from, delta * days), to: addDays(period.to, delta * days) };
}

export type PeriodKind = "month" | "months" | "all" | "range";

export function describePeriod(
  period: { from: string; to: string },
  minDate: string,
  maxDate: string,
): { kind: PeriodKind; title: string; detail: string } {
  const { from, to } = period;
  if (from === minDate && to === maxDate) {
    return { kind: "all", title: "Cały okres", detail: rangeLabel(from, to) };
  }
  const span = monthSpan(period);
  if (span === 1) return { kind: "month", title: monthLabel(from.slice(0, 7)), detail: "" };
  if (span > 1) {
    const start = monthLabel(from.slice(0, 7));
    const end = monthLabel(to.slice(0, 7));
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return {
      kind: "months",
      title: sameYear ? `${start.replace(/ \d{4}$/, "")} – ${end}` : `${start} – ${end}`,
      detail: `${span} mies.`,
    };
  }
  const days = from && to ? dayCount(period) : 0;
  if (to === today() && (days === 30 || days === 90)) {
    return { kind: "range", title: `Ostatnie ${days} dni`, detail: rangeLabel(from, to) };
  }
  return { kind: "range", title: rangeLabel(from, to), detail: days ? `${days} dni` : "" };
}

export function previousComparable(
  period: { from: string; to: string },
  maxDate: string,
): { period: { from: string; to: string }; label: string } | null {
  if (!period.from || !period.to) return null;
  const span = monthSpan(period);
  if (span === 1) {
    const prevMonth = shiftMonth(period.from.slice(0, 7), -1);
    const prev = monthRange(prevMonth);
    const monthIndex = Number(prevMonth.slice(5, 7)) - 1;
    const cutoff = [today(), maxDate].filter((iso) => iso >= period.from && iso < period.to).sort()[0];
    if (cutoff) {
      const day = Math.min(Number(cutoff.slice(8, 10)), Number(prev.to.slice(8, 10)));
      return {
        period: { from: prev.from, to: `${prevMonth}-${String(day).padStart(2, "0")}` },
        label: `1–${day} ${MONTHS_GENITIVE[monthIndex]}`,
      };
    }
    return { period: prev, label: MONTHS_NOMINATIVE[monthIndex] };
  }
  return {
    period: stepPeriod(period, -1),
    label: span ? `poprzednie ${span} mies.` : `poprzednie ${dayCount(period)} dni`,
  };
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${((part / total) * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
}

export function compactMoney(value: number): string {
  return `${new Intl.NumberFormat("pl-PL", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value)} zł`;
}

export function shortMonthTick(month: string): string {
  const [year, m] = month.split("-");
  if (!year || !m) return month;
  return `${m}.${year.slice(2)}`;
}

export const WEEKDAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

export const WEEKDAY_NAMES = ["Poniedziałki", "Wtorki", "Środy", "Czwartki", "Piątki", "Soboty", "Niedziele"];

export const CATEGORY_COLORS: Record<string, string> = {
  Spożywcze: "#2F6F4E",
  "Jedzenie na mieście": "#C45C4A",
  Paliwo: "#C47A12",
  Transport: "#3D6EA8",
  Rachunki: "#6B5B95",
  Mieszkanie: "#8B6914",
  Zdrowie: "#3F8C7A",
  Odzież: "#A45D7A",
  Rozrywka: "#4A7C59",
  Subskrypcje: "#2C5F7C",
  Inwestycje: "#1F4E79",
  Finanse: "#5C6370",
  Przelewy: "#7A6A4F",
  Wynagrodzenie: "#1F7A4D",
  Inne: "#8A8175",
};

const FALLBACK = ["#8A5A44", "#4F6D7A", "#6B4E71", "#3E5C41", "#9A6B2F", "#5A4E3B"];

export function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

export function bucketQuery(bucket?: { min: number; max: number | null }): { minAmount?: string; maxAmount?: string } {
  if (!bucket) return {};
  return {
    ...(bucket.min > 0 ? { minAmount: String(bucket.min) } : {}),
    ...(bucket.max != null ? { maxAmount: String(Math.round((bucket.max - 0.01) * 100) / 100) } : {}),
  };
}

export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = { day: "Dzień", week: "Tydzień", month: "Miesiąc" };

export function autoGranularity(period: { from: string; to: string }, isAll: boolean): Granularity {
  if (!period.from || !period.to) return "month";
  if (isAll) return "month";
  const days = dayCount(period);
  if (days <= 92) return "day";
  if (days <= 365) return "week";
  return "month";
}

export type TimeBucket = { key: string; from: string; to: string; label: string; tick: string };

function mondayOf(iso: string): string {
  const date = parseIso(iso);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return isoDate(date);
}

export function bucketKey(iso: string, granularity: Granularity): string {
  if (granularity === "month") return iso.slice(0, 7);
  if (granularity === "week") return mondayOf(iso);
  return iso.slice(0, 10);
}

function dayTick(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function buildBuckets(from: string, to: string, granularity: Granularity): TimeBucket[] {
  if (!from || !to || from > to) return [];
  const buckets: TimeBucket[] = [];
  if (granularity === "month") {
    let month = from.slice(0, 7);
    for (let guard = 0; month <= to.slice(0, 7) && guard < 600; guard += 1) {
      const range = monthRange(month);
      buckets.push({
        key: month,
        from: range.from < from ? from : range.from,
        to: range.to > to ? to : range.to,
        label: monthLabel(month),
        tick: shortMonthTick(month),
      });
      month = shiftMonth(month, 1);
    }
    return buckets;
  }
  if (granularity === "week") {
    let start = mondayOf(from);
    for (let guard = 0; start <= to && guard < 600; guard += 1) {
      const end = addDays(start, 6);
      const clippedFrom = start < from ? from : start;
      const clippedTo = end > to ? to : end;
      buckets.push({
        key: start,
        from: clippedFrom,
        to: clippedTo,
        label: `Tydzień ${rangeLabel(clippedFrom, clippedTo)}`,
        tick: dayTick(start),
      });
      start = addDays(start, 7);
    }
    return buckets;
  }
  let day = from;
  for (let guard = 0; day <= to && guard < 4000; guard += 1) {
    const weekday = parseIso(day).toLocaleDateString("pl-PL", { weekday: "short" });
    buckets.push({ key: day, from: day, to: day, label: `${formatDay(day)} · ${weekday}`, tick: dayTick(day) });
    day = addDays(day, 1);
  }
  return buckets;
}

export function suggestPattern(text: string): string {
  const cleaned = text.replace(/^www\./i, "").replace(/^https?:\/\//i, "").trim();
  const token = cleaned.split(/[\s,/|]+/).find((part) => part.replace(/[.\d]/g, "").length >= 3);
  return (token || cleaned).slice(0, 40);
}
