import { DEFAULT_CATEGORY, amountBucketDefs } from "../../../shared/domain.ts";
import { parseIso } from "../../../shared/dates.ts";
import type { Stats, TxFilters } from "../../../shared/types.ts";
import { hiddenCategoryNames, scrubHiddenCategories } from "../categories/categories.ts";
import { buildCategoryBudgets, periodMonthFactor } from "../categories/limits.ts";
import { amountThresholds } from "../settings/store.ts";
import { countTransactions, dateBounds, filterClause } from "../transactions/repository.ts";
import { db } from "../../platform/db.ts";

function addTo(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) || 0) + value);
}

/** Splits "bucket|category" keys back into rows; spend is positive, near-zero balances are dropped. */
function splitKey<K extends string>(map: Map<string, number>, name: K) {
  return [...map.entries()]
    .filter(([, net]) => Math.abs(net) > 0.004)
    .map(([key, net]) => {
      const [bucket, category] = key.split("|");
      return { [name]: bucket, category, amount: -net } as Record<K, string> & { category: string; amount: number };
    })
    .sort((a, b) => (a[name] < b[name] ? -1 : a[name] > b[name] ? 1 : 0));
}

/**
 * Totals for the filtered view. Hidden (excluded) payments are skipped unless `includeExcluded`,
 * except in `byMonth` ("Ile zostaje"), which always counts them.
 */
export function getStats(filters: TxFilters): Stats {
  scrubHiddenCategories();
  const { where, params } = filterClause(filters);
  const rows = db
    .prepare(`SELECT amount, category, date, excluded FROM transactions WHERE ${where}`)
    .all(...params) as { amount: number; category: string; date: string; excluded: number }[];

  let income = 0;
  let expenses = 0;
  let excludedCount = 0;
  let excludedSpend = 0;
  const byCategory = new Map<string, number>();
  const monthCategory = new Map<string, number>();
  const dayCategory = new Map<string, number>();
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];
  const buckets = amountBucketDefs(amountThresholds()).map((bucket) => ({ ...bucket, amount: 0, count: 0 }));
  for (const row of rows) {
    const category = row.category || DEFAULT_CATEGORY;
    if (row.excluded) {
      excludedCount += 1;
      if (row.amount < 0) excludedSpend += -row.amount;
      if (!filters.includeExcluded) continue;
    }
    addTo(byCategory, category, row.amount);
    addTo(monthCategory, `${row.date.slice(0, 7)}|${category}`, row.amount);
    addTo(dayCategory, `${row.date.slice(0, 10)}|${category}`, row.amount);
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
    const [year, month, day] = row.date.split("-").map(Number);
    if (year && month && day) weekdaySpend[parseIso(row.date).getDay()] += spent;
  }

  const byMonth = db
    .prepare(
      `SELECT substr(date, 1, 7) AS month,
              SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS expenses
       FROM transactions
       WHERE ${where}
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`,
    )
    .all(...params) as { month: string; income: number; expenses: number }[];

  const bounds = dateBounds(filters.account);
  const from = filters.from || bounds.minDate || "";
  const to = filters.to || bounds.maxDate || "";
  const factor = periodMonthFactor(from, to);
  return {
    from,
    to,
    income,
    expenses,
    net: income - expenses,
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => a.amount - b.amount),
    byMonth,
    byMonthCategory: splitKey(monthCategory, "month"),
    byDayCategory: splitKey(dayCategory, "date"),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((jsDay) => ({ id: jsDay, amount: weekdaySpend[jsDay] })),
    byAmount: buckets,
    count: rows.length,
    totalAll: countTransactions(filters.account),
    excludedCount,
    excludedSpend,
    limitMonths: factor,
    limits: buildCategoryBudgets(byCategory, factor, hiddenCategoryNames()),
  };
}
