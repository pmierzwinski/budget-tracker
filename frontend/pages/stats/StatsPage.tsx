import { useEffect, useMemo, useState } from "react";
import { getContext } from "../../app/AppContext";
import { AiEvaluation } from "../../modules/ai";
import { EmptyPeriod, PeriodBar, useComparison, usePeriod, describePeriod, type Granularity, type TimeBucket } from "../../modules/period";
import { useAsync } from "../../lib/useAsync";
import { toFilters, useTransactionEdits } from "../../modules/payments";
import { errorMessage } from "../../lib/format";
import type { RecurringStatus } from "../../../shared/types";
import {
  BiggestCard,
  CompareCard,
  DailyCard,
  DrillPanel,
  LeftoverCard,
  MonthMatrixCard,
  RecurringCard,
  TopPayeesCard,
  TrendCard,
  computeInsights,
  computeStats,
  setRecurringStatus,
  useTrendChart,
} from "../../modules/statistics";
import "./stats-page.css";

/** `picked.key` for "this category over the whole period" (legend click) instead of one chart bucket. */
const PERIOD_KEY = "__period";

export function StatsPage() {
  const { database, account, navigate } = getContext();
  const { period, setPeriod, bounds } = usePeriod("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showExcluded, setShowExcluded] = useState(false);
  const [yMaxInput, setYMaxInput] = useState("");
  const [picked, setPicked] = useState<{ key: string; category: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  const info = describePeriod(period, bounds.minDate, bounds.maxDate);
  const filters = toFilters({ ...period, includeExcluded: showExcluded }, account);
  const stats = useAsync(() => computeStats(database.data, filters), [period.from, period.to, showExcluded, version]);
  // Not reloaded after hiding a payment, so it stays in "Największe wydatki" and can be unhidden there.
  const insights = useAsync(() => computeInsights(database.data, filters), [period.from, period.to, showExcluded]);
  const { comparison, previousStats } = useComparison(period, bounds, { includeExcluded: showExcluded, version });
  const trend = useTrendChart(stats.data, period, bounds.maxDate, info.kind === "all");
  const { chart, chartEnd } = trend;
  const visibleCategories = useMemo(
    () => chart.series.filter((row) => !hidden.has(row.category)).map((row) => row.category),
    [chart.series, hidden],
  );
  const refresh = () => setVersion((value) => value + 1);

  const biggestEdits = useTransactionEdits({
    updateItems: (update) => insights.setData((data) => data && { ...data, biggest: update(data.biggest) }),
    onSaved: refresh,
    onFailed: (message) => {
      setError(message);
      insights.reload();
    },
  });

  useEffect(() => {
    setPicked(null);
    setHidden(new Set());
  }, [period.from, period.to]);

  function isolated(category: string) {
    return chart.series.every((row) => (row.category === category ? !hidden.has(row.category) : hidden.has(row.category)));
  }

  /** Shows only this category; again shows all. */
  function isolate(category: string) {
    const names = chart.series.map((row) => row.category);
    setHidden(isolated(category) ? new Set() : new Set(names.filter((name) => name !== category)));
  }

  function focusCategory(category: string) {
    const closing = isolated(category);
    isolate(category);
    setPicked(closing ? null : { key: PERIOD_KEY, category });
  }

  async function changeRecurring(key: string, status: RecurringStatus) {
    insights.setData((current) =>
      current && {
        ...current,
        recurring: current.recurring.map((row) =>
          row.key === key ? { ...row, status, active: status === "auto" ? row.autoActive : status === "active" } : row,
        ),
      },
    );
    try {
      await database.update((draft) => setRecurringStatus(draft, key, status));
    } catch (err) {
      setError(errorMessage(err, "Nie zapisano statusu"));
      insights.reload();
    }
  }

  function pickGranularity(next: Granularity) {
    setPicked(null);
    trend.setGranularity(next);
  }

  const shownError = error || stats.error;
  if (!stats.data) return shownError ? <p className="banner error">{shownError}</p> : <p className="muted loading">Ładowanie…</p>;
  const data = stats.data;

  const header = <PeriodBar page="Statystyki" period={period} onChange={setPeriod} sticky />;

  if (!data.count) {
    return (
      <section className="page">
        {header}
        <EmptyPeriod title="Brak płatności w tym okresie" totalAll={data.totalAll} onPeriod={setPeriod} />
      </section>
    );
  }

  const wholePeriod = picked?.key === PERIOD_KEY;
  const pickedIndex = picked && !wholePeriod ? chart.buckets.findIndex((bucket) => bucket.key === picked.key) : -1;
  const pickedSeries = picked ? chart.series.find((row) => row.category === picked.category) : undefined;
  const pickedBucket: TimeBucket | null = wholePeriod
    ? { key: PERIOD_KEY, from: period.from, to: chartEnd, label: info.kind === "all" ? "Cały okres" : info.title, tick: "" }
    : pickedIndex >= 0
      ? chart.buckets[pickedIndex]
      : null;
  const pickedValue = wholePeriod
    ? (pickedSeries?.values || []).reduce((sum, value) => sum + value, 0)
    : pickedIndex >= 0
      ? pickedSeries?.values[pickedIndex] || 0
      : 0;

  return (
    <section className="page">
      {header}
      {shownError ? <p className="banner error">{shownError}</p> : null}

      <TrendCard
        buckets={chart.buckets}
        series={chart.series}
        granularity={trend.granularity}
        autoGranularity={trend.auto}
        onGranularity={pickGranularity}
        showExcluded={showExcluded}
        excludedCount={data.excludedCount}
        onShowExcluded={setShowExcluded}
        yMaxInput={yMaxInput}
        onYMaxInput={setYMaxInput}
        hidden={hidden}
        onShowAll={() => {
          setHidden(new Set());
          if (wholePeriod) setPicked(null);
        }}
        onLegend={focusCategory}
        selected={picked && pickedIndex >= 0 ? { index: pickedIndex, category: picked.category } : null}
        onPick={(index, category) => {
          const key = chart.buckets[index]?.key;
          if (!key) return;
          setPicked((current) => (current && current.key === key && current.category === category ? null : { key, category }));
        }}
      />

      {picked && pickedBucket ? (
        <DrillPanel
          bucket={pickedBucket}
          category={picked.category}
          total={pickedValue}
          showExcluded={showExcluded}
          onClose={() => setPicked(null)}
          onChanged={refresh}
        />
      ) : null}

      {bounds.minDate ? <AiEvaluation variant="strip" period={period} onSetup={() => navigate("settings", "ai")} /> : null}

      <LeftoverCard months={data.byMonth} />

      <MonthMatrixCard
        rows={data.byMonthCategory}
        categories={visibleCategories}
        onIsolate={isolate}
      />

      <header className="section-head">
        <p className="eyebrow">Więcej statystyk</p>
        <h2>Szczegóły okresu</h2>
      </header>

      <div className="insight-grid">
        {insights.data ? <DailyCard daily={insights.data.daily} untilToday={period.to > chartEnd} /> : null}
        {comparison ? <CompareCard stats={data} previousStats={previousStats} label={comparison.label} /> : null}
        {insights.data?.payees.length ? <TopPayeesCard payees={insights.data.payees} /> : null}
        {insights.data?.biggest.length ? (
          <BiggestCard items={insights.data.biggest} onExcluded={(item, excluded) => void biggestEdits.changeExcluded(item, excluded)} />
        ) : null}
        {insights.data ? <RecurringCard recurring={insights.data.recurring} onStatus={(key, status) => void changeRecurring(key, status)} /> : null}
      </div>
    </section>
  );
}
