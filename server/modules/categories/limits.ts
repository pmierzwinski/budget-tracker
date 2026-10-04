import { limitStatus } from "../../../shared/domain.ts";
import { dayNumber, daysInMonth, shiftMonth } from "../../../shared/dates.ts";
import { round2, round3 } from "../../../shared/numbers.ts";
import type { CategoryBudget, CategoryLimitSetting } from "../../../shared/types.ts";
import { db } from "../../platform/db.ts";

/** How many months (fractional, by days) the range covers — monthly limits are scaled by it. */
export function periodMonthFactor(from: string, to: string): number {
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

export function listCategoryLimits(): CategoryLimitSetting[] {
  const rows = db.prepare("SELECT category, monthly_limit FROM category_limits ORDER BY category").all() as {
    category: string;
    monthly_limit: number;
  }[];
  return rows
    .filter((row) => row.monthly_limit > 0)
    .map((row) => ({ category: row.category, monthlyLimit: Number(row.monthly_limit) }));
}

/** Empty, zero or invalid limit removes it. */
export function setCategoryLimit(category: string, monthlyLimit: number | null): CategoryLimitSetting[] {
  const name = category.trim();
  if (!name) throw new Error("Podaj kategorię");
  if (monthlyLimit == null || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(name);
    return listCategoryLimits();
  }
  db.prepare(
    `INSERT INTO category_limits (category, monthly_limit) VALUES (?, ?)
     ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
  ).run(name, round2(monthlyLimit));
  return listCategoryLimits();
}

const STATUS_RANK = { over: 0, warn: 1, ok: 2 };

/** Limit usage per category; `netByCategory` is the category balance in the period (spend is negative). */
export function buildCategoryBudgets(
  netByCategory: Map<string, number>,
  factor: number,
  hidden: Set<string>,
): CategoryBudget[] {
  const budgets: CategoryBudget[] = [];
  for (const row of listCategoryLimits()) {
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
