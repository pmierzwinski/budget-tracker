import { RECURRING_STATUSES, compareRecurring, merchantPattern, payeeLabel } from "../../../shared/domain.ts";
import { isoDate, monthIndex, parseIso } from "../../../shared/dates.ts";
import type { Insights, RecurringStatus, Transaction, TxFilters } from "../../../shared/types.ts";
import { forAccount } from "../../platform/db.ts";
import { getJsonSetting, setJsonSetting } from "../settings/store.ts";
import { dateBounds, filterClause, selectTransactions } from "../transactions/repository.ts";

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
    groups.set(key, [...(groups.get(key) || []), tx]);
  }
  return groups;
}

// ---------- Recurring payment overrides (settings.recurring_overrides: key → status) ----------

function getRecurringOverrides(): Record<string, RecurringStatus> {
  const parsed = getJsonSetting<Record<string, string>>("recurring_overrides", {});
  const clean: Record<string, RecurringStatus> = {};
  for (const [key, value] of Object.entries(parsed || {})) {
    if (RECURRING_STATUSES.includes(value as RecurringStatus) && value !== "auto") clean[key] = value as RecurringStatus;
  }
  return clean;
}

export function setRecurringStatus(key: string, status: RecurringStatus): void {
  const clean = key.trim().toLowerCase();
  if (!clean) throw new Error("Brak nazwy płatności cyklicznej.");
  if (!RECURRING_STATUSES.includes(status)) throw new Error("Nieznany status płatności cyklicznej.");
  const overrides = getRecurringOverrides();
  if (status === "auto") delete overrides[clean];
  else overrides[clean] = status;
  setJsonSetting("recurring_overrides", overrides);
}

// ---------- Insights ----------

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

function dailyStats(rows: Transaction[], from: string, to: string): Insights["daily"] {
  const spendByDay = new Map<string, number>();
  for (const tx of rows) spendByDay.set(tx.date, (spendByDay.get(tx.date) || 0) - tx.amount);
  const daily: number[] = [];
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
      daily.push(spent);
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
  const total = daily.reduce((sum, value) => sum + value, 0);
  const spendDays = daily.filter((value) => value > 0.004).length;
  return {
    days: daily.length,
    average: daily.length ? total / daily.length : 0,
    median: median(daily),
    spendDays,
    noSpendDays: daily.length - spendDays,
    weekdayAverage: weekdayDays ? weekdaySum / weekdayDays : 0,
    weekendAverage: weekendDays ? weekendSum / weekendDays : 0,
    maxDay,
  };
}

/**
 * Same payee (merchant pattern) in ≥3 months with a steady amount, over the whole history.
 * Auto status is "active" when the last payment is in the last or previous month of data.
 */
function recurringPayments(account: string | undefined, maxDate: string): Insights["recurring"] {
  const scoped = forAccount("amount < 0 AND excluded = 0", [], account);
  const history = selectTransactions(scoped.where, scoped.params);
  const byMerchant = new Map<string, Transaction[]>();
  for (const tx of history) {
    const key = merchantPattern(tx).toLowerCase();
    if (key.length < 2) continue;
    byMerchant.set(key, [...(byMerchant.get(key) || []), tx]);
  }
  const recurring: Insights["recurring"] = [];
  const activeSince = maxDate ? monthIndex(maxDate) - 1 : 0;
  const overrides = getRecurringOverrides();
  for (const [key, items] of byMerchant) {
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

export function getInsights(filters: TxFilters): Insights {
  const { where, params } = filterClause({ from: filters.from, to: filters.to, account: filters.account, kind: "expense" });
  const rows = selectTransactions(where, params, filters.includeExcluded ? "" : " AND excluded = 0");

  const bounds = dateBounds(filters.account);
  const from = filters.from || bounds.minDate;
  const lastData = [bounds.maxDate, isoDate(new Date())].filter(Boolean).sort().pop() || "";
  const to = [filters.to || bounds.maxDate, lastData].filter(Boolean).sort()[0] || "";

  return {
    payees: topPayees(rows),
    biggest: [...rows].sort((a, b) => a.amount - b.amount).slice(0, 8),
    recurring: recurringPayments(filters.account, bounds.maxDate),
    daily: dailyStats(rows, from, to),
  };
}
