export function money(value: number, currency = "PLN"): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
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

export function addCalendarMonths(iso: string, delta: number): string {
  if (!iso) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const target = new Date(year, month - 1 + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDate(new Date(target.getFullYear(), target.getMonth(), Math.min(day, lastDay)));
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
): string {
  return [
    period.from || "",
    period.to || "",
    filters?.category || "",
    filters?.kind && filters.kind !== "all" ? filters.kind : "",
    filters?.minAmount || "",
    filters?.maxAmount || "",
  ].join("|");
}

export function shiftPeriod(period: { from: string; to: string }, delta: number): { from: string; to: string } {
  if (period.from && period.to && isMonthStart(period.from) && isMonthEnd(period.to)) {
    return {
      from: monthRange(shiftMonth(period.from.slice(0, 7), delta)).from,
      to: monthRange(shiftMonth(period.to.slice(0, 7), delta)).to,
    };
  }
  return {
    from: addCalendarMonths(period.from, delta),
    to: addCalendarMonths(period.to, delta),
  };
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
  "Poza statystykami": "#B7AFA3",
  Inne: "#8A8175",
};

const FALLBACK = ["#8A5A44", "#4F6D7A", "#6B4E71", "#3E5C41", "#9A6B2F", "#5A4E3B"];

export function categoryColor(name: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

export const AMOUNT_BUCKET_QUERY: Record<string, { minAmount?: string; maxAmount?: string }> = {
  gt500: { minAmount: "500" },
  "300-500": { minAmount: "300", maxAmount: "499.99" },
  "100-300": { minAmount: "100", maxAmount: "299.99" },
  lt100: { maxAmount: "99.99" },
};

export function suggestPattern(text: string): string {
  const cleaned = text.replace(/^www\./i, "").replace(/^https?:\/\//i, "").trim();
  const token = cleaned.split(/[\s,/|]+/).find((part) => part.replace(/[.\d]/g, "").length >= 3);
  return (token || cleaned).slice(0, 40);
}
