import { limitStatus } from "../shared/domain.ts";
import { dayNumber, daysInMonth, shiftMonth } from "../shared/dates.ts";
import { round2, round3 } from "../shared/numbers.ts";
import type { CategoryBudget, CategoryLimitSetting } from "../shared/types.ts";
import type { LimitRepository } from "./LimitRepository.ts";

const STATUS_RANK = { over: 0, warn: 1, ok: 2 };

/** Monthly category limits and their usage in any date range (scaled by days). */
export class BudgetService {
  readonly #limits: LimitRepository;

  constructor(limits: LimitRepository) {
    this.#limits = limits;
  }

  /** How many months (fractional, by days) the range covers — monthly limits are scaled by it. */
  static periodMonthFactor(from: string, to: string): number {
    if (!from || !to || from > to) return 1;
    let factor = 0;
    for (let cursor = from.slice(0, 7); cursor <= to.slice(0, 7); cursor = shiftMonth(cursor, 1)) {
      const [year, month] = cursor.split("-").map(Number);
      const lastDay = daysInMonth(year, month);
      const monthStart = `${cursor}-01`;
      const monthEnd = `${cursor}-${String(lastDay).padStart(2, "0")}`;
      const overlapStart = from > monthStart ? from : monthStart;
      const overlapEnd = to < monthEnd ? to : monthEnd;
      if (overlapStart <= overlapEnd) {
        factor += (dayNumber(overlapEnd) - dayNumber(overlapStart) + 1) / lastDay;
      }
    }
    return Math.max(round3(factor), 0.01);
  }

  list(): CategoryLimitSetting[] {
    return this.#limits.list();
  }

  /** Empty, zero or invalid limit removes it. */
  set(category: string, monthlyLimit: number | null): CategoryLimitSetting[] {
    const name = category.trim();
    if (!name) throw new Error("Podaj kategorię");
    if (monthlyLimit == null || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) this.#limits.delete(name);
    else this.#limits.set(name, round2(monthlyLimit));
    return this.#limits.list();
  }

  /** Limit usage per category; `netByCategory` is the category balance in the period (spend is negative). */
  budgets(netByCategory: Map<string, number>, factor: number, hidden: Set<string>): CategoryBudget[] {
    const budgets: CategoryBudget[] = [];
    for (const row of this.#limits.list()) {
      if (hidden.has(row.category)) continue;
      const net = netByCategory.get(row.category) || 0;
      const spent = net < 0 ? -net : 0;
      const allowed = round2(row.monthlyLimit * factor);
      const ratio = allowed > 0 ? spent / allowed : 0;
      budgets.push({
        category: row.category,
        monthlyLimit: row.monthlyLimit,
        allowed,
        spent: round2(spent),
        remaining: round2(allowed - spent),
        ratio: round3(ratio),
        status: limitStatus(ratio),
      });
    }
    return budgets.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.ratio - a.ratio);
  }
}
