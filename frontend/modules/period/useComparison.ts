import { getContext } from "../../app/AppContext";
import { toFilters } from "../payments/transactions";
import { computeStats } from "../statistics/stats";
import { describePeriod, previousComparable, type Period } from "./period";
import type { Stats } from "../../../shared/types";
import { useAsync } from "../../lib/useAsync";

/** Stats of the previous comparable period (none for the whole history). */
export function useComparison(
  period: Period,
  bounds: { minDate: string; maxDate: string },
  options: { includeExcluded?: boolean; version?: number } = {},
) {
  const { database, account } = getContext();
  const isAll = describePeriod(period, bounds.minDate, bounds.maxDate).kind === "all";
  const comparison = isAll ? null : previousComparable(period, bounds.maxDate);
  const key = comparison ? `${comparison.period.from}|${comparison.period.to}|${Boolean(options.includeExcluded)}` : "";
  const previous = useAsync<{ key: string; stats: Stats }>(
    () =>
      comparison
        ? { key, stats: computeStats(database.data, toFilters({ ...comparison.period, includeExcluded: options.includeExcluded }, account)) }
        : null,
    [key, options.version],
  );
  return { comparison, previousStats: previous.data?.key === key ? previous.data.stats : null };
}
