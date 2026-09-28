import { useState } from "react";
import { useApp } from "../app/AppContext";
import { allPeriod, latestMonthPeriod, type Period } from "../period";

/**
 * The page's period, starting at the last month with data ("month") or the whole history ("all").
 * Without any data it starts at this month, so the page can show its empty state.
 */
export function usePeriod(start: "month" | "all") {
  const { meta } = useApp();
  const bounds = { minDate: meta.minDate, maxDate: meta.maxDate };
  const [period, setPeriod] = useState<Period>(() =>
    start === "all" && meta.minDate ? allPeriod(meta.minDate, meta.maxDate) : latestMonthPeriod(meta.maxDate),
  );
  return { period, setPeriod, bounds };
}
