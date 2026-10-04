import { DEFAULT_CATEGORY, amountBucketDefs } from "../shared/domain.ts";
import { parseIso } from "../shared/dates.ts";
import type { Stats, TxFilters } from "../shared/types.ts";
import { BudgetService } from "../categories/BudgetService.ts";
import type { CategoryService } from "../categories/CategoryService.ts";
import type { ChartSettingsService } from "../settings/ChartSettingsService.ts";
import { TransactionFilter } from "../transactions/TransactionFilter.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";

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

/** Totals of the filtered view: KPIs, categories, time series, weekdays, amount buckets and limits. */
export class StatsService {
  readonly #transactions: TransactionRepository;
  readonly #categories: CategoryService;
  readonly #budgets: BudgetService;
  readonly #charts: ChartSettingsService;

  constructor(
    transactions: TransactionRepository,
    categories: CategoryService,
    budgets: BudgetService,
    charts: ChartSettingsService,
  ) {
    this.#transactions = transactions;
    this.#categories = categories;
    this.#budgets = budgets;
    this.#charts = charts;
  }

  /**
   * Hidden (excluded) payments are skipped unless `includeExcluded`,
   * except in `byMonth` ("Ile zostaje"), which always counts them.
   */
  stats(filters: TxFilters): Stats {
    this.#categories.scrubHidden();
    const where = TransactionFilter.where(filters);
    const rows = this.#transactions.selectForStats(where);

    let income = 0;
    let expenses = 0;
    let excludedCount = 0;
    let excludedSpend = 0;
    const byCategory = new Tally();
    const monthCategory = new Tally();
    const dayCategory = new Tally();
    const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];
    const buckets = amountBucketDefs(this.#charts.amountThresholds()).map((bucket) => ({ ...bucket, amount: 0, count: 0 }));
    for (const row of rows) {
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
      const [year, month, day] = row.date.split("-").map(Number);
      if (year && month && day) weekdaySpend[parseIso(row.date).getDay()] += spent;
    }

    const byMonth = this.#transactions.monthTotals(where);
    const bounds = this.#transactions.dateBounds(filters.account);
    const from = filters.from || bounds.minDate || "";
    const to = filters.to || bounds.maxDate || "";
    const factor = BudgetService.periodMonthFactor(from, to);
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
      byMonthCategory: monthCategory.split("month"),
      byDayCategory: dayCategory.split("date"),
      byWeekday: [1, 2, 3, 4, 5, 6, 0].map((jsDay) => ({ id: jsDay, amount: weekdaySpend[jsDay] })),
      byAmount: buckets,
      count: rows.length,
      totalAll: this.#transactions.countAll(filters.account),
      excludedCount,
      excludedSpend,
      limitMonths: factor,
      limits: this.#budgets.budgets(byCategory, factor, this.#categories.hiddenNames()),
    };
  }
}
