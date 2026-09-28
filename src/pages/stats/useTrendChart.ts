import { useMemo, useState } from "react";
import { autoGranularity, bucketKey, buildBuckets, dayCount, today, type Granularity, type Period } from "../../period";
import type { Stats } from "../../types";

export type TrendSeries = { category: string; values: number[] };

/**
 * Category spend per time bucket. The granularity follows the period unless picked by hand (a manual pick
 * sticks only while the period length stays the same). The chart ends today when the period runs further.
 */
export function useTrendChart(stats: Stats | null, period: Period, maxDate: string, isAll: boolean) {
  const [manual, setManual] = useState<{ granularity: Granularity; days: number } | null>(null);
  const days = period.from && period.to ? dayCount(period) : 0;
  const auto = autoGranularity(period, isAll);
  const granularity = manual && manual.days === days ? manual.granularity : auto;
  const chartEnd = [period.to, [today(), maxDate].sort().pop() || period.to].sort()[0];

  const chart = useMemo(() => {
    const buckets = buildBuckets(period.from, chartEnd, granularity);
    const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
    const totals = new Map<string, number>();
    const values = new Map<string, number[]>();
    for (const row of stats?.byDayCategory || []) {
      const at = index.get(bucketKey(row.date, granularity));
      if (at == null) continue;
      totals.set(row.category, (totals.get(row.category) || 0) + row.amount);
      const list = values.get(row.category) || new Array(buckets.length).fill(0);
      list[at] += row.amount;
      values.set(row.category, list);
    }
    const series: TrendSeries[] = [...totals.entries()]
      .filter(([, total]) => total > 0.004)
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => ({ category, values: values.get(category) || [] }));
    return { buckets, series };
  }, [stats, period.from, chartEnd, granularity]);

  return {
    chart,
    chartEnd,
    granularity,
    auto,
    setGranularity: (next: Granularity) => setManual(next === auto ? null : { granularity: next, days }),
  };
}
