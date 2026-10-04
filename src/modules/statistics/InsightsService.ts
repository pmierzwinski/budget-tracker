import { compareRecurring, merchantPattern, payeeLabel } from "../shared/domain.ts";
import { isoDate, monthIndex, parseIso } from "../shared/dates.ts";
import type { Insights, Transaction, TxFilters } from "../shared/types.ts";
import { SqlWhere } from "../core/Repository.ts";
import { TransactionFilter } from "../transactions/TransactionFilter.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import type { RecurringOverrides } from "./RecurringOverrides.ts";

class Series {
  static median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  static mostCommon(values: string[]): string {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  static groupBy(items: Transaction[], keyOf: (tx: Transaction) => string): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();
    for (const tx of items) {
      const key = keyOf(tx);
      groups.set(key, [...(groups.get(key) || []), tx]);
    }
    return groups;
  }
}

/**
 * Same payee (merchant pattern) in ≥3 months with a steady amount, over the whole history.
 * Auto status is "active" when the last payment is in the last or previous month of data.
 */
export class RecurringDetector {
  readonly #transactions: TransactionRepository;
  readonly #overrides: RecurringOverrides;

  constructor(transactions: TransactionRepository, overrides: RecurringOverrides) {
    this.#transactions = transactions;
    this.#overrides = overrides;
  }

  detect(account: string | undefined, maxDate: string): Insights["recurring"] {
    const history = this.#transactions.select(new SqlWhere("amount < 0 AND excluded = 0").forAccount(account));
    const byMerchant = new Map<string, Transaction[]>();
    for (const tx of history) {
      const key = merchantPattern(tx).toLowerCase();
      if (key.length < 2) continue;
      byMerchant.set(key, [...(byMerchant.get(key) || []), tx]);
    }
    const recurring: Insights["recurring"] = [];
    const activeSince = maxDate ? monthIndex(maxDate) - 1 : 0;
    const overrides = this.#overrides.all();
    for (const [key, items] of byMerchant) {
      const months = new Set(items.map((tx) => tx.date.slice(0, 7)));
      if (months.size < 3) continue;
      const sortedMonths = [...months].sort();
      const span = monthIndex(sortedMonths[sortedMonths.length - 1]) - monthIndex(sortedMonths[0]) + 1;
      if (months.size / span < 0.7 || items.length / months.size > 1.6) continue;
      const amounts = items.map((tx) => -tx.amount);
      const typical = Series.median(amounts);
      const steady = amounts.filter((value) => Math.abs(value - typical) <= Math.max(typical * 0.2, 2)).length;
      if (steady / amounts.length < 0.7) continue;
      const lastDate = items.map((tx) => tx.date).sort().pop() || "";
      const autoActive = monthIndex(lastDate) >= activeSince;
      const status = overrides[key] || "auto";
      recurring.push({
        key,
        name: Series.mostCommon(items.map(payeeLabel)),
        category: Series.mostCommon(items.map((tx) => tx.category)),
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
}

/** Period details: top payees, biggest expenses, recurring payments (whole history) and day-by-day stats. */
export class InsightsService {
  readonly #transactions: TransactionRepository;
  readonly #recurring: RecurringDetector;

  constructor(transactions: TransactionRepository, recurring: RecurringDetector) {
    this.#transactions = transactions;
    this.#recurring = recurring;
  }

  insights(filters: TxFilters): Insights {
    const where = TransactionFilter.where({ from: filters.from, to: filters.to, account: filters.account, kind: "expense" });
    if (!filters.includeExcluded) where.add("excluded = 0");
    const rows = this.#transactions.select(where);

    const bounds = this.#transactions.dateBounds(filters.account);
    const from = filters.from || bounds.minDate;
    const lastData = [bounds.maxDate, isoDate(new Date())].filter(Boolean).sort().pop() || "";
    const to = [filters.to || bounds.maxDate, lastData].filter(Boolean).sort()[0] || "";

    return {
      payees: InsightsService.#topPayees(rows),
      biggest: [...rows].sort((a, b) => a.amount - b.amount).slice(0, 8),
      recurring: this.#recurring.detect(filters.account, bounds.maxDate),
      daily: InsightsService.#daily(rows, from, to),
    };
  }

  static #topPayees(rows: Transaction[]): Insights["payees"] {
    return [...Series.groupBy(rows, (tx) => payeeLabel(tx).toLowerCase()).values()]
      .map((items) => {
        const amount = items.reduce((sum, tx) => sum - tx.amount, 0);
        return {
          name: Series.mostCommon(items.map(payeeLabel)),
          category: Series.mostCommon(items.map((tx) => tx.category)),
          amount,
          count: items.length,
          average: amount / items.length,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }

  static #daily(rows: Transaction[], from: string, to: string): Insights["daily"] {
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
      median: Series.median(daily),
      spendDays,
      noSpendDays: daily.length - spendDays,
      weekdayAverage: weekdayDays ? weekdaySum / weekdayDays : 0,
      weekendAverage: weekendDays ? weekendSum / weekendDays : 0,
      maxDay,
    };
  }
}
