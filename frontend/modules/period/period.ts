// Periods (from–to ranges of ISO days): presets, stepping, labels, comparison and chart time buckets.
import { MONTHS_GENITIVE, MONTHS_NOMINATIVE, isMonthEnd, isMonthStart, isoDate, isoMonth, parseIso, shiftMonth } from "../../../shared/dates";
import { formatDay, monthLabel, rangeLabel, shortMonthTick } from "../../lib/format";

export type Period = { from: string; to: string };

export function today(): string {
  return isoDate(new Date());
}

export function currentMonth(): string {
  return isoMonth(new Date());
}

export function addDays(iso: string, delta: number): string {
  const date = parseIso(iso);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

export function dayCount(period: Period): number {
  return Math.round((parseIso(period.to).getTime() - parseIso(period.from).getTime()) / 86_400_000) + 1;
}

export function monthRange(month: string): Period {
  const [year, m] = month.split("-").map(Number);
  return { from: isoDate(new Date(year, m - 1, 1)), to: isoDate(new Date(year, m, 0)) };
}

export function allPeriod(minDate: string, maxDate: string): Period {
  return { from: minDate, to: maxDate };
}

export function applyPreset(preset: string, minDate: string, maxDate: string): Period {
  const end = today();
  if (preset === "month") return monthRange(currentMonth());
  if (preset === "30") return { from: addDays(end, -29), to: end };
  if (preset === "90") return { from: addDays(end, -89), to: end };
  return allPeriod(minDate, maxDate);
}

/** This month, or the last month with data when the data ends earlier. */
export function latestMonthPeriod(maxDate: string): Period {
  const month = currentMonth();
  return monthRange(maxDate && maxDate.slice(0, 7) < month ? maxDate.slice(0, 7) : month);
}

/** Number of whole calendar months the period spans, 0 when it is not made of whole months. */
export function monthSpan(period: Period): number {
  if (!period.from || !period.to || !isMonthStart(period.from) || !isMonthEnd(period.to)) return 0;
  const [fromYear, fromMonth] = period.from.split("-").map(Number);
  const [toYear, toMonth] = period.to.split("-").map(Number);
  return Math.max(0, (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1);
}

/** Moves the period by its own length (whole months stay whole months). */
export function stepPeriod(period: Period, delta: number): Period {
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
  period: Period,
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

/** The previous comparable period; for the current month only the same number of days ("1–12 września"). */
export function previousComparable(period: Period, maxDate: string): { period: Period; label: string } | null {
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

// ---------- Chart time buckets ----------

export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = { day: "Dzień", week: "Tydzień", month: "Miesiąc" };

/** 30 days / a month / 90 days → days, whole range → months; custom: ≤92 days, ≤365 weeks, more months. */
export function autoGranularity(period: Period, isAll: boolean): Granularity {
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
