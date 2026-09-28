import type { Stats } from "../../types";

/** Spend in the period, or only in the given categories. */
export function spendOf(stats: Stats, categories: string[]): number {
  if (!categories.length) return stats.expenses;
  return -stats.byCategory
    .filter((slice) => categories.includes(slice.category))
    .reduce((sum, slice) => sum + slice.amount, 0);
}
