import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { AiEvaluation } from "../components/AiEvaluationCard";
import { TrendLines } from "../components/Charts";
import { ExcludeToggle } from "../components/ExcludeToggle";
import { Icon } from "../components/Icon";
import type { Navigate } from "../components/Layout";
import { PeriodBar, allPeriod, latestMonthPeriod, type Period } from "../components/PeriodBar";
import {
  GRANULARITY_LABELS,
  MONTHS_SHORT,
  autoGranularity,
  bucketKey,
  buildBuckets,
  categoryColor,
  dayCount,
  describePeriod,
  formatDay,
  money,
  monthLabel,
  percent,
  plural,
  previousComparable,
  shortDate,
  today,
  type Granularity,
  type TimeBucket,
} from "../format";
import type { Insights, RecurringStatus, Stats as StatsData, Transaction } from "../types";

const PERIOD_KEY = "__period";

const RECURRING_ORDER: Record<RecurringStatus, number> = { auto: 0, active: 1, ended: 2, hidden: 3 };

function columnLabel(month: string): string {
  return `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

function spendByCategory(stats: StatsData | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of stats?.byCategory || []) if (row.amount < 0) map.set(row.category, -row.amount);
  return map;
}

function DrillPanel({
  bucket,
  category,
  total,
  showExcluded,
  onClose,
  onChanged,
}: {
  bucket: TimeBucket;
  category: string;
  total: number;
  showExcluded: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    api
      .transactions({ from: bucket.from, to: bucket.to, category, sort: "amount_desc" })
      .then((data) => alive && setItems(data.items))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [bucket.from, bucket.to, category]);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [bucket.key, category]);

  async function toggle(item: Transaction, excluded: boolean) {
    setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, excluded } : row)) || null);
    try {
      await api.setExcluded(item.id, excluded);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano zmiany");
    }
  }

  const counted = (items || []).filter((row) => showExcluded || !row.excluded);
  const hiddenHere = (items || []).length - counted.length;

  return (
    <article className="card drill-card" ref={ref} aria-live="polite">
      <div className="card-head">
        <div>
          <p className="eyebrow">{bucket.label}</p>
          <h2 className="drill-title">
            <span className="swatch" style={{ background: categoryColor(category) }} />
            {category}
            <span className="drill-sum">{money(total)}</span>
          </h2>
          <p className="card-sub">
            {items
              ? `${counted.length} ${plural(counted.length, "płatność", "płatności", "płatności")}${
                  hiddenHere
                    ? ` · ${hiddenHere} ${plural(hiddenHere, "ukryta nie liczy", "ukryte nie liczą", "ukrytych nie liczy")} się do wykresu`
                    : ""
                }`
              : "Ładowanie płatności…"}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Zamknij listę płatności" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {error ? <p className="banner error">{error}</p> : null}
      {items && !items.length ? <p className="muted">Brak płatności w tym zakresie.</p> : null}
      {items?.length ? (
        <ul className="drill-list">
          {items.map((item) => (
            <li key={item.id} className={item.excluded && !showExcluded ? "excluded" : undefined}>
              <span className="drill-date">{shortDate(item.date)}</span>
              <span className="drill-who">
                <strong title={item.payee || undefined}>{item.payee || item.type || "Operacja"}</strong>
                {item.title || item.comment ? (
                  <em title={item.title}>{[item.comment, item.title].filter(Boolean).join(" · ")}</em>
                ) : null}
              </span>
              <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => void toggle(item, next)} />
              <strong className={item.amount < 0 ? "num neg" : "num pos"}>{money(item.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function Stats({ onNavigate }: { onNavigate: Navigate }) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<StatsData | null>(null);
  const [previous, setPrevious] = useState<{ key: string; stats: StatsData } | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showExcluded, setShowExcluded] = useState(false);
  const [manual, setManual] = useState<{ granularity: Granularity; days: number } | null>(null);
  const [yMaxInput, setYMaxInput] = useState("");
  const [picked, setPicked] = useState<{ key: string; category: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");

  const info = describePeriod(period, bounds.minDate, bounds.maxDate);
  const comparison = period.from && info.kind !== "all" ? previousComparable(period, bounds.maxDate) : null;
  const comparisonKey = comparison ? `${comparison.period.from}|${comparison.period.to}` : "";

  useEffect(() => {
    api
      .meta()
      .then((meta) => {
        setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
        setPeriod((current) => (current.from ? current : allPeriod(meta.minDate, meta.maxDate)));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    setPicked(null);
    setHidden(new Set());
  }, [period.from, period.to]);

  useEffect(() => {
    if (!period.from && !period.to) return;
    let alive = true;
    const params = { ...period, includeExcluded: showExcluded };
    api
      .stats(params)
      .then((next) => alive && setStats(next))
      .catch((err: Error) => alive && setError(err.message));
    api
      .insights(params)
      .then((next) => alive && setInsights(next))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [period.from, period.to, showExcluded, version]);

  useEffect(() => {
    if (!comparisonKey) return;
    const [from, to] = comparisonKey.split("|");
    let alive = true;
    api
      .stats({ from, to, includeExcluded: showExcluded })
      .then((next) => alive && setPrevious({ key: `${comparisonKey}|${showExcluded}`, stats: next }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [comparisonKey, showExcluded, version]);

  const days = period.from && period.to ? dayCount(period) : 0;
  const auto = autoGranularity(period, info.kind === "all");
  const granularity = manual && manual.days === days ? manual.granularity : auto;
  const chartEnd = [period.to, [today(), bounds.maxDate].sort().pop() || period.to].sort()[0];

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
    const series = [...totals.entries()]
      .filter(([, total]) => total > 0.004)
      .sort((a, b) => b[1] - a[1])
      .map(([category]) => ({ category, values: values.get(category) || [] }));
    return { buckets, series };
  }, [stats, period.from, chartEnd, granularity]);

  const visible = useMemo(() => chart.series.filter((row) => !hidden.has(row.category)), [chart.series, hidden]);

  const months = useMemo(() => {
    const rows = stats?.byMonthCategory || [];
    const list = [...new Set(rows.map((row) => row.month))].sort();
    const lookup = new Map(rows.map((row) => [`${row.month}|${row.category}`, row.amount]));
    return {
      list,
      series: visible.map((row) => ({
        category: row.category,
        values: list.map((month) => lookup.get(`${month}|${row.category}`) || 0),
      })),
    };
  }, [stats, visible]);

  const yMax = useMemo(() => {
    const typed = Number(yMaxInput.replace(",", "."));
    return yMaxInput.trim() && !Number.isNaN(typed) && typed > 0 ? typed : undefined;
  }, [yMaxInput]);

  function isolated(category: string) {
    return chart.series.every((row) => (row.category === category ? !hidden.has(row.category) : hidden.has(row.category)));
  }

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
    setInsights((current) =>
      current
        ? {
            ...current,
            recurring: current.recurring.map((row) =>
              row.key === key
                ? { ...row, status, active: status === "auto" ? row.autoActive : status === "active" }
                : row,
            ),
          }
        : current,
    );
    try {
      await api.setRecurringStatus(key, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano statusu");
      setVersion((value) => value + 1);
    }
  }

  function pickGranularity(next: Granularity) {
    setPicked(null);
    setManual(next === auto ? null : { granularity: next, days });
  }

  if (!stats) return error ? <p className="banner error">{error}</p> : <p className="muted loading">Ładowanie…</p>;

  const header = (
    <PeriodBar
      page="Statystyki"
      period={period}
      minDate={bounds.minDate}
      maxDate={bounds.maxDate}
      onChange={setPeriod}
      sticky
    />
  );

  if (!stats.count) {
    return (
      <section className="page">
        {header}
        <div className="empty-card">
          <h2>Brak płatności w tym okresie</h2>
          <p>
            {stats.totalAll
              ? `W bazie jest ${stats.totalAll} operacji — wybierz okres, w którym coś się działo.`
              : "Zaimportuj historię z banku, a statystyki pojawią się od razu."}
          </p>
          <div className="row">
            {stats.totalAll ? (
              <>
                <button type="button" className="primary" onClick={() => setPeriod(latestMonthPeriod(bounds.maxDate))}>
                  Ostatni miesiąc z danymi
                </button>
                <button type="button" className="ghost" onClick={() => setPeriod(allPeriod(bounds.minDate, bounds.maxDate))}>
                  Cały okres
                </button>
              </>
            ) : (
              <button type="button" className="primary" onClick={() => onNavigate("import")}>
                Importuj historię
              </button>
            )}
          </div>
        </div>
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

  const leftover = stats.byMonth.map((row) => ({ ...row, net: row.income - row.expenses }));
  const leftoverSum = leftover.reduce((sum, row) => sum + row.net, 0);
  const lastLeft = leftover[leftover.length - 1];
  const average = leftover.length ? leftoverSum / leftover.length : 0;

  const previousStats =
    previous && previous.key === `${comparisonKey}|${showExcluded}` ? previous.stats : null;
  const now = spendByCategory(stats);
  const before = spendByCategory(previousStats);
  const compareRows = [...new Set([...now.keys(), ...before.keys()])]
    .map((category) => ({ category, current: now.get(category) || 0, previous: before.get(category) || 0 }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
  const recurringRows = [...(insights?.recurring || [])].sort(
    (a, b) =>
      RECURRING_ORDER[a.status] - RECURRING_ORDER[b.status] ||
      Number(b.active) - Number(a.active) ||
      b.amount - a.amount,
  );
  const recurringActive = recurringRows.filter((row) => row.active);
  const recurringNew = recurringRows.filter((row) => row.status === "auto").length;
  const recurringMonthly = recurringActive.reduce((sum, row) => sum + row.amount, 0);

  return (
    <section className="page">
      {header}
      {error ? <p className="banner error">{error}</p> : null}

      <article className="card trend-card">
        <div className="card-head">
          <div>
            <h2>Wydatki kategorii w czasie</h2>
            <p className="card-sub">
              Najedź na punkt, żeby zobaczyć kwoty · kliknij punkt albo kategorię w legendzie, żeby zobaczyć jej
              płatności
            </p>
          </div>
          <div className="trend-tools">
            <div className="segmented sm" role="group" aria-label="Podział osi czasu">
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={granularity === option ? "active" : undefined}
                  aria-pressed={granularity === option}
                  title={option === auto ? "Domyślny podział dla tego okresu" : undefined}
                  onClick={() => pickGranularity(option)}
                >
                  {GRANULARITY_LABELS[option]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={showExcluded ? "toggle-chip sm active" : "toggle-chip sm"}
              aria-pressed={showExcluded}
              disabled={!stats.excludedCount && !showExcluded}
              title={
                stats.excludedCount
                  ? "Płatności ukryte w statystykach (np. duże jednorazowe) — pokaż je w ich kategoriach"
                  : "W tym okresie nie ma ukrytych płatności"
              }
              onClick={() => setShowExcluded(!showExcluded)}
            >
              <Icon name={showExcluded ? "eye" : "eyeOff"} size={14} />
              {showExcluded ? "Ukryte widoczne" : "Pokaż ukryte"}
              <span className="count">{stats.excludedCount}</span>
            </button>
            <label className="ymax-field" title="Wszystko powyżej tej kwoty zostanie ucięte — przydaje się, gdy jeden szczyt spłaszcza resztę wykresu">
              Oś Y do
              <input inputMode="decimal" placeholder="zł" value={yMaxInput} onChange={(e) => setYMaxInput(e.target.value)} />
            </label>
            {hidden.size ? (
              <button
                type="button"
                className="ghost sm"
                onClick={() => {
                  setHidden(new Set());
                  if (wholePeriod) setPicked(null);
                }}
              >
                Pokaż wszystkie
              </button>
            ) : null}
          </div>
        </div>
        {chart.series.length ? (
          <TrendLines
            points={chart.buckets}
            series={chart.series}
            hidden={hidden}
            onLegend={focusCategory}
            yMax={yMax}
            selected={picked && pickedIndex >= 0 ? { index: pickedIndex, category: picked.category } : null}
            onPick={(index, category) => {
              const key = chart.buckets[index]?.key;
              if (!key) return;
              setPicked((current) =>
                current && current.key === key && current.category === category ? null : { key, category },
              );
            }}
          />
        ) : (
          <p className="muted">W tym okresie są tylko wpływy — brak wydatków do narysowania.</p>
        )}
      </article>

      {picked && pickedBucket ? (
        <DrillPanel
          bucket={pickedBucket}
          category={picked.category}
          total={pickedValue}
          showExcluded={showExcluded}
          onClose={() => setPicked(null)}
          onChanged={() => setVersion((value) => value + 1)}
        />
      ) : null}

      {bounds.minDate ? (
        <AiEvaluation variant="strip" period={period} onSetup={() => onNavigate("settings", "ai")} />
      ) : null}

      {leftover.length ? (
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Ile zostaje</h2>
              <p className="card-sub">Przychody minus wydatki — tu liczą się też płatności ukryte w statystykach</p>
            </div>
          </div>
          <div className="leftover">
            <dl className="stat-list">
              <div>
                <dt>Suma w okresie</dt>
                <dd className={leftoverSum >= 0 ? "pos" : "neg"}>{money(leftoverSum)}</dd>
              </div>
              {leftover.length > 1 ? (
                <>
                  <div>
                    <dt>Średnio na miesiąc</dt>
                    <dd className={average >= 0 ? "pos" : "neg"}>{money(average)}</dd>
                  </div>
                  <div>
                    <dt>Ostatni miesiąc{lastLeft ? ` · ${monthLabel(lastLeft.month)}` : ""}</dt>
                    <dd className={(lastLeft?.net || 0) >= 0 ? "pos" : "neg"}>{lastLeft ? money(lastLeft.net) : "—"}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            <div className="table-wrap flat">
              <table>
                <thead>
                  <tr>
                    <th>Miesiąc</th>
                    <th className="num">Przychody</th>
                    <th className="num">Wydatki</th>
                    <th className="num">Zostaje</th>
                  </tr>
                </thead>
                <tbody>
                  {leftover.map((row) => (
                    <tr key={row.month}>
                      <td>{monthLabel(row.month)}</td>
                      <td className="num">{money(row.income)}</td>
                      <td className="num">{money(row.expenses)}</td>
                      <td className={row.net >= 0 ? "num pos strong" : "num neg strong"}>{money(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      ) : null}

      {months.list.length > 1 ? (
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Kwoty i zmiana do poprzedniego miesiąca</h2>
              <p className="card-sub">Czerwony procent — wydatki wzrosły, zielony — spadły</p>
            </div>
          </div>
          <div className="table-wrap flat">
            <table className="matrix">
              <thead>
                <tr>
                  <th className="sticky-col">Kategoria</th>
                  {months.list.map((month) => (
                    <th key={month} className="num">
                      {columnLabel(month)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.series.map((row) => (
                  <tr key={row.category}>
                    <td className="sticky-col">
                      <button type="button" className="legend-btn" onClick={() => isolate(row.category)}>
                        <span style={{ background: categoryColor(row.category) }} />
                        {row.category}
                      </button>
                    </td>
                    {row.values.map((value, index) => {
                      const prev = index > 0 ? row.values[index - 1] : 0;
                      const delta = prev ? (value - prev) / prev : 0;
                      return (
                        <td key={months.list[index]} className="num">
                          <span className="cell-value">{value ? money(value) : "—"}</span>
                          {index > 0 && prev ? (
                            <span className={delta > 0 ? "cell-delta neg" : "cell-delta pos"}>
                              {`${delta > 0 ? "+" : ""}${percent(value - prev, prev)}`}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <header className="section-head">
        <p className="eyebrow">Więcej statystyk</p>
        <h2>Szczegóły okresu</h2>
      </header>

      <div className="insight-grid">
        {insights ? (
          <article className="card">
            <div className="card-head">
              <div>
                <h2>Dzień po dniu</h2>
                <p className="card-sub">
                  {insights.daily.days} {plural(insights.daily.days, "dzień", "dni", "dni")} w okresie
                  {period.to > chartEnd ? " (do dziś)" : ""}
                </p>
              </div>
            </div>
            <dl className="stat-grid">
              <div>
                <dt>Średnio dziennie</dt>
                <dd>{money(insights.daily.average)}</dd>
              </div>
              <div>
                <dt>Typowy dzień (mediana)</dt>
                <dd>{money(insights.daily.median)}</dd>
              </div>
              <div>
                <dt>Dni bez wydatków</dt>
                <dd>
                  {insights.daily.noSpendDays}
                  <small> z {insights.daily.days}</small>
                </dd>
              </div>
              <div>
                <dt>Najdroższy dzień</dt>
                <dd>
                  {insights.daily.maxDay ? money(insights.daily.maxDay.amount) : "—"}
                  {insights.daily.maxDay ? <small> {formatDay(insights.daily.maxDay.date, false)}</small> : null}
                </dd>
              </div>
              <div>
                <dt>Dzień roboczy</dt>
                <dd>{money(insights.daily.weekdayAverage)}</dd>
              </div>
              <div>
                <dt>Dzień weekendu</dt>
                <dd className={insights.daily.weekendAverage > insights.daily.weekdayAverage ? "neg" : undefined}>
                  {money(insights.daily.weekendAverage)}
                </dd>
              </div>
            </dl>
          </article>
        ) : null}

        {comparison ? (
          <article className="card compare">
            <div className="card-head">
              <div>
                <h2>Porównanie z poprzednim okresem</h2>
                <p className="card-sub">Ten okres vs {comparison.label}</p>
              </div>
            </div>
            {previousStats ? (
              <div className="table-wrap flat">
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>Kategoria</th>
                      <th className="num">Teraz</th>
                      <th className="num">Wcześniej</th>
                      <th className="num">Zmiana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => {
                      const diff = row.current - row.previous;
                      return (
                        <tr key={row.category}>
                          <td>
                            <span className="rule-cat">
                              <span className="swatch" style={{ background: categoryColor(row.category) }} />
                              {row.category}
                            </span>
                          </td>
                          <td className="num">{row.current ? money(row.current) : "—"}</td>
                          <td className="num muted">{row.previous ? money(row.previous) : "—"}</td>
                          <td className={`num strong ${diff > 0.5 ? "neg" : diff < -0.5 ? "pos" : "muted"}`}>
                            {row.previous
                              ? `${diff > 0 ? "+" : ""}${percent(diff, row.previous)}`
                              : row.current
                                ? "nowa"
                                : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Razem</td>
                      <td className="num">{money(stats.expenses)}</td>
                      <td className="num">{money(previousStats.expenses)}</td>
                      <td className={stats.expenses > previousStats.expenses ? "num neg" : "num pos"}>
                        {previousStats.expenses
                          ? `${stats.expenses > previousStats.expenses ? "+" : ""}${percent(
                              stats.expenses - previousStats.expenses,
                              previousStats.expenses,
                            )}`
                          : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="muted">Ładowanie…</p>
            )}
          </article>
        ) : null}

        {insights?.payees.length ? (
          <article className="card grow">
            <div className="card-head">
              <div>
                <h2>Gdzie idzie najwięcej</h2>
                <p className="card-sub">Odbiorcy z największą sumą wydatków w okresie</p>
              </div>
            </div>
            <div className="table-wrap flat">
              <table className="compact-table">
                <thead>
                  <tr>
                    <th>Odbiorca</th>
                    <th className="num">Płatności</th>
                    <th className="num">Średnio</th>
                    <th className="num">Razem</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.payees.map((row) => (
                    <tr key={row.name}>
                      <td className="cell-name">
                        <span className="rule-cat" title={`${row.name} · ${row.category}`}>
                          <span className="swatch" style={{ background: categoryColor(row.category) }} />
                          <span>{row.name}</span>
                        </span>
                      </td>
                      <td className="num">{row.count}</td>
                      <td className="num muted">{money(row.average)}</td>
                      <td className="num strong">{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}

        {insights?.biggest.length ? (
          <article className="card">
            <div className="card-head">
              <div>
                <h2>Największe wydatki</h2>
                <p className="card-sub">Jednorazowo duże kwoty możesz od razu ukryć w statystykach</p>
              </div>
            </div>
            <ul className="drill-list">
              {insights.biggest.map((item) => (
                <li key={item.id}>
                  <span className="drill-date">{shortDate(item.date)}</span>
                  <span className="drill-who">
                    <strong title={item.payee || undefined}>{item.payee || item.type || "Operacja"}</strong>
                    <em>
                      <span className="swatch" style={{ background: categoryColor(item.category) }} /> {item.category}
                      {item.comment ? ` · ${item.comment}` : ""}
                    </em>
                  </span>
                  <ExcludeToggle
                    compact
                    excluded={item.excluded}
                    onToggle={(next) => {
                      void api
                        .setExcluded(item.id, next)
                        .then(() => setVersion((value) => value + 1))
                        .catch((err: Error) => setError(err.message));
                    }}
                  />
                  <strong className="num neg">{money(item.amount)}</strong>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        {insights ? (
          <article className="card wide">
            <div className="card-head">
              <div>
                <h2>Płatności cykliczne</h2>
                <p className="card-sub">
                  Wykryte z całej historii: ten sam odbiorca co miesiąc, podobna kwota. „Aktywna” — ostatnia płatność
                  była w ostatnim lub przedostatnim miesiącu danych, starsze są „zakończone”. Na górze nowe, jeszcze
                  nieprzejrzane{recurringNew ? ` (${recurringNew})` : ""}; ustawione ręcznie idą niżej, „to nie
                  cykliczna” na sam dół.
                </p>
              </div>
              {recurringActive.length ? (
                <span className="pill" title="Suma zwykłych kwot aktywnych płatności cyklicznych">
                  ≈ {money(recurringMonthly)} / mies.
                </span>
              ) : null}
            </div>
            {insights.recurring.length ? (
              <div className="table-wrap flat">
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>Odbiorca</th>
                      <th>Kategoria</th>
                      <th className="num">Zwykle</th>
                      <th className="num">Miesięcy</th>
                      <th className="num">Ostatnio</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recurringRows.map((row) => (
                      <tr key={row.key} className={row.active && row.status !== "hidden" ? undefined : "faded"}>
                        <td className="cell-name">
                          <strong title={row.name}>{row.name}</strong>
                        </td>
                        <td>
                          <span className="rule-cat">
                            <span className="swatch" style={{ background: categoryColor(row.category) }} />
                            {row.category}
                          </span>
                        </td>
                        <td className="num strong">{money(row.amount)}</td>
                        <td className="num">{row.months}</td>
                        <td className="num muted">{formatDay(row.lastDate)}</td>
                        <td className="num">
                          <select
                            className={`status-select${row.status === "hidden" ? "" : row.active ? " ok" : " ended"}`}
                            value={row.status}
                            aria-label={`Status płatności cyklicznej ${row.name}`}
                            title={
                              row.status === "auto"
                                ? "Status wyliczony z daty ostatniej płatności"
                                : "Status ustawiony ręcznie"
                            }
                            onChange={(event) => void changeRecurring(row.key, event.target.value as RecurringStatus)}
                          >
                            <option value="auto">{row.autoActive ? "aktywna" : "zakończona"} (auto)</option>
                            <option value="active">aktywna</option>
                            <option value="ended">zakończona</option>
                            <option value="hidden">to nie cykliczna</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Nie widać regularnych płatności — potrzeba co najmniej 3 miesięcy historii.</p>
            )}
          </article>
        ) : null}
      </div>
    </section>
  );
}
