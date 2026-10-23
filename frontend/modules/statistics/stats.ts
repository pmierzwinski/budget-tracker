// Totals of the filtered view (Stats), period details (Insights) and the "Wielkość płatności" thresholds.
import {
  DEFAULT_AMOUNT_THRESHOLDS,
  DEFAULT_CATEGORY,
  MAX_AMOUNT_THRESHOLDS,
  RECURRING_STATUSES,
  amountBucketDefs,
  compareRecurring,
  merchantPattern,
  payeeLabel,
} from "../../../shared/domain";
import { isoDate, monthIndex, parseIso } from "../../../shared/dates";
import { round2 } from "../../../shared/numbers";
import type { Store } from "../../../shared/store";
import type { Insights, RecurringStatus, Stats, Transaction, TxFilters } from "../../../shared/types";
import { budgets, periodMonthFactor } from "../categories/categories";
import { dateBounds, filterTransactions, ofAccount } from "../payments/transactions";

const THRESHOLDS = "amount_buckets";
const RECURRING = "recurring_overrides";

export function amountThresholds(store: Store): number[] {
  const values = (store.settings[THRESHOLDS] || "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? [...new Set(values)].sort((a, b) => a - b) : DEFAULT_AMOUNT_THRESHOLDS;
}

export function setAmountThresholds(draft: Store, values: number[]): number[] {
  const clean = [...new Set(values.map(round2))].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!clean.length) throw new Error("Podaj co najmniej jeden próg kwoty.");
  if (clean.length > MAX_AMOUNT_THRESHOLDS) throw new Error("Maksymalnie 9 progów — wykres robi się nieczytelny.");
  draft.settings = { ...draft.settings, [THRESHOLDS]: clean.join(",") };
  return clean;
}

/** Sums values under string keys. */
class Tally extends Map<string, number> {
  add(key: string, value: number): void {
    this.set(key, (this.get(key) || 0) + value);
  }

  /** Splits "bucket|category" keys back into rows; spend is positive, near-zero balances are dropped. */
  split<K extends string>(name: K) {
    return [...this.entries()]
      .filter(([, net]) => Math.abs(net) > 0.004)
      .map(([key, net]) => {
        const [bucket, category] = key.split("|");
        return { [name]: bucket, category, amount: -net } as Record<K, string> & { category: string; amount: number };
      })
      .sort((a, b) => (a[name] < b[name] ? -1 : a[name] > b[name] ? 1 : 0));
  }
}

/** Hidden (excluded) payments are skipped unless `includeExcluded`, except in `byMonth` ("Ile zostaje"). */
export function computeStats(store: Store, filters: TxFilters): Stats {
  const all = ofAccount(store.transactions, filters.account);
  const rows = filterTransactions(all, filters);

  let income = 0;
  let expenses = 0;
  let excludedCount = 0;
  let excludedSpend = 0;
  const byCategory = new Tally();
  const monthCategory = new Tally();
  const dayCategory = new Tally();
  const months = new Map<string, { month: string; income: number; expenses: number }>();
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];
  const buckets = amountBucketDefs(amountThresholds(store)).map((bucket) => ({ ...bucket, amount: 0, count: 0 }));
  for (const row of rows) {
    const month = months.get(row.date.slice(0, 7)) || { month: row.date.slice(0, 7), income: 0, expenses: 0 };
    if (row.amount > 0) month.income += row.amount;
    else month.expenses -= row.amount;
    months.set(month.month, month);

    const category = row.category || DEFAULT_CATEGORY;
    if (row.excluded) {
      excludedCount += 1;
      if (row.amount < 0) excludedSpend += -row.amount;
      if (!filters.includeExcluded) continue;
    }
    byCategory.add(category, row.amount);
    monthCategory.add(`${row.date.slice(0, 7)}|${category}`, row.amount);
    dayCategory.add(`${row.date.slice(0, 10)}|${category}`, row.amount);
    if (row.amount >= 0) {
      income += row.amount;
      continue;
    }
    const spent = -row.amount;
    expenses += spent;
    const bucket = buckets.find((item) => spent >= item.min && (item.max == null || spent < item.max));
    if (bucket) {
      bucket.amount += spent;
      bucket.count += 1;
    }
    weekdaySpend[parseIso(row.date).getDay()] += spent;
  }

  const bounds = dateBounds(all);
  const from = filters.from || bounds.minDate;
  const to = filters.to || bounds.maxDate;
  const factor = periodMonthFactor(from, to);
  return {
    from,
    to,
    income,
    expenses,
    net: income - expenses,
    byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => a.amount - b.amount),
    byMonth: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    byMonthCategory: monthCategory.split("month"),
    byDayCategory: dayCategory.split("date"),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((jsDay) => ({ id: jsDay, amount: weekdaySpend[jsDay] })),
    byAmount: buckets,
    count: rows.length,
    totalAll: all.length,
    excludedCount,
    excludedSpend,
    limitMonths: factor,
    limits: budgets(store, byCategory, factor),
  };
}

/** Period details: top payees, biggest expenses, recurring payments (whole history) and day-by-day stats. */
export function computeInsights(store: Store, filters: TxFilters): Insights {
  const all = ofAccount(store.transactions, filters.account);
  const rows = filterTransactions(all, { from: filters.from, to: filters.to, kind: "expense" }).filter(
    (tx) => filters.includeExcluded || !tx.excluded,
  );
  const bounds = dateBounds(all);
  const from = filters.from || bounds.minDate;
  const lastData = [bounds.maxDate, isoDate(new Date())].filter(Boolean).sort().pop() || "";
  const to = [filters.to || bounds.maxDate, lastData].filter(Boolean).sort()[0] || "";
  return {
    payees: topPayees(rows),
    biggest: [...rows].sort((a, b) => a.amount - b.amount).slice(0, 8),
    recurring: detectRecurring(all, bounds.maxDate, recurringOverrides(store)),
    daily: daily(rows, from, to),
  };
}

export function recurringOverrides(store: Store): Record<string, RecurringStatus> {
  let parsed: Record<string, string> = {};
  try {
    parsed = JSON.parse(store.settings[RECURRING] || "{}") as Record<string, string>;
  } catch {
    // broken value — no overrides
  }
  const clean: Record<string, RecurringStatus> = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (RECURRING_STATUSES.includes(value as RecurringStatus) && value !== "auto") clean[key] = value as RecurringStatus;
  }
  return clean;
}

export function setRecurringStatus(draft: Store, key: string, status: RecurringStatus): void {
  const clean = key.trim().toLowerCase();
  if (!clean) throw new Error("Brak nazwy płatności cyklicznej.");
  if (!RECURRING_STATUSES.includes(status)) throw new Error("Nieznany status płatności cyklicznej.");
  const overrides = recurringOverrides(draft);
  if (status === "auto") delete overrides[clean];
  else overrides[clean] = status;
  draft.settings = { ...draft.settings, [RECURRING]: JSON.stringify(overrides) };
}

/**
 * Same payee (merchant pattern) in ≥3 months with a steady amount, over the whole history.
 * Auto status is "active" when the last payment is in the last or previous month of data.
 */
function detectRecurring(all: Transaction[], maxDate: string, overrides: Record<string, RecurringStatus>): Insights["recurring"] {
  const byMerchant = groupBy(
    all.filter((tx) => tx.amount < 0 && !tx.excluded),
    (tx) => merchantPattern(tx).toLowerCase(),
  );
  const activeSince = maxDate ? monthIndex(maxDate) - 1 : 0;
  const recurring: Insights["recurring"] = [];
  for (const [key, items] of byMerchant) {
    if (key.length < 2) continue;
    const months = new Set(items.map((tx) => tx.date.slice(0, 7)));
    if (months.size < 3) continue;
    const sortedMonths = [...months].sort();
    const span = monthIndex(sortedMonths[sortedMonths.length - 1]) - monthIndex(sortedMonths[0]) + 1;
    if (months.size / span < 0.7 || items.length / months.size > 1.6) continue;
    const amounts = items.map((tx) => -tx.amount);
    const typical = median(amounts);
    const steady = amounts.filter((value) => Math.abs(value - typical) <= Math.max(typical * 0.2, 2)).length;
    if (steady / amounts.length < 0.7) continue;
    const lastDate = items.map((tx) => tx.date).sort().pop() || "";
    const autoActive = monthIndex(lastDate) >= activeSince;
    const status = overrides[key] || "auto";
    recurring.push({
      key,
      name: mostCommon(items.map(payeeLabel)),
      category: mostCommon(items.map((tx) => tx.category)),
      amount: typical,
      months: months.size,
      lastDate,
      active: status === "auto" ? autoActive : status === "active",
      autoActive,
      status,
    });
  }
  return recurring.sort(compareRecurring).slice(0, 40);
}

function topPayees(rows: Transaction[]): Insights["payees"] {
  return [...groupBy(rows, (tx) => payeeLabel(tx).toLowerCase()).values()]
    .map((items) => {
      const amount = items.reduce((sum, tx) => sum - tx.amount, 0);
      return {
        name: mostCommon(items.map(payeeLabel)),
        category: mostCommon(items.map((tx) => tx.category)),
        amount,
        count: items.length,
        average: amount / items.length,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);
}

function daily(rows: Transaction[], from: string, to: string): Insights["daily"] {
  const spendByDay = new Map<string, number>();
  for (const tx of rows) spendByDay.set(tx.date, (spendByDay.get(tx.date) || 0) - tx.amount);
  const days: number[] = [];
  let weekdaySum = 0;
  let weekdayDays = 0;
  let weekendSum = 0;
  let weekendDays = 0;
  let maxDay: Insights["daily"]["maxDay"] = null;
  if (from && to && from <= to) {
    const cursor = parseIso(from);
    for (let guard = 0; guard < 4000; guard += 1) {
      const iso = isoDate(cursor);
      if (iso > to) break;
      const spent = spendByDay.get(iso) || 0;
      days.push(spent);
      if (cursor.getDay() === 0 || cursor.getDay() === 6) {
        weekendSum += spent;
        weekendDays += 1;
      } else {
        weekdaySum += spent;
        weekdayDays += 1;
      }
      if (spent > 0 && (!maxDay || spent > maxDay.amount)) maxDay = { date: iso, amount: spent };
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const total = days.reduce((sum, value) => sum + value, 0);
  const spendDays = days.filter((value) => value > 0.004).length;
  return {
    days: days.length,
    average: days.length ? total / days.length : 0,
    median: median(days),
    spendDays,
    noSpendDays: days.length - spendDays,
    weekdayAverage: weekdayDays ? weekdaySum / weekdayDays : 0,
    weekendAverage: weekendDays ? weekendSum / weekendDays : 0,
    maxDay,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function groupBy(items: Transaction[], keyOf: (tx: Transaction) => string): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>();
  for (const tx of items) {
    const key = keyOf(tx);
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }
  return groups;
}
