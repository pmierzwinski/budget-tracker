import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AiEvaluation } from "../components/AiEvaluationCard";
import { TrendLines } from "../components/Charts";
import type { Page } from "../components/Layout";
import { PeriodBar, allPeriod, type Period } from "../components/PeriodBar";
import { MONTHS_SHORT, categoryColor, money, monthLabel, percent } from "../format";
import type { Stats } from "../types";

function clipYMax(values: number[]) {
  const sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.9) - 1));
  return Math.max(sorted[index] * 1.08, 1);
}

function columnLabel(month: string): string {
  return `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function Trends({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [clipOutliers, setClipOutliers] = useState(false);
  const [yMaxInput, setYMaxInput] = useState("");
  const [error, setError] = useState("");

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
    if (!period.from && !period.to) return;
    let alive = true;
    api
      .stats(period)
      .then((next) => {
        if (!alive) return;
        setStats(next);
        setHidden(new Set());
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period.from, period.to]);

  const chart = useMemo(() => {
    const rows = stats?.byMonthCategory || [];
    const months = [...new Set(rows.map((row) => row.month))].sort();
    const totals = new Map<string, number>();
    for (const row of rows) totals.set(row.category, (totals.get(row.category) || 0) + row.amount);
    const categories = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const lookup = new Map(rows.map((row) => [`${row.month}|${row.category}`, row.amount]));
    const series = categories.map((category) => ({
      category,
      values: months.map((month) => lookup.get(`${month}|${category}`) || 0),
    }));
    return { months, series };
  }, [stats]);

  const visible = useMemo(
    () => chart.series.filter((row) => !hidden.has(row.category)),
    [chart.series, hidden],
  );

  const yMax = useMemo(() => {
    const typed = Number(yMaxInput.replace(",", "."));
    if (yMaxInput.trim() && !Number.isNaN(typed) && typed > 0) return typed;
    if (!clipOutliers) return undefined;
    return clipYMax(visible.flatMap((row) => row.values));
  }, [yMaxInput, clipOutliers, visible]);

  function isolate(category: string) {
    setHidden((current) => {
      const names = chart.series.map((row) => row.category);
      const onlyThis = names.every((name) => (name === category ? !current.has(name) : current.has(name)));
      if (onlyThis) return new Set();
      return new Set(names.filter((name) => name !== category));
    });
  }

  if (!stats) return error ? <p className="banner error">{error}</p> : <p className="muted loading">Ładowanie…</p>;

  const leftover = stats.byMonth.map((row) => ({ ...row, net: row.income - row.expenses }));
  const leftoverSum = leftover.reduce((sum, row) => sum + row.net, 0);
  const lastLeft = leftover[leftover.length - 1];
  const average = leftover.length ? leftoverSum / leftover.length : 0;
  const empty = !stats.byMonth.length && !chart.months.length;

  return (
    <section className="page">
      <PeriodBar
        page="Miesiąc do miesiąca"
        period={period}
        minDate={bounds.minDate}
        maxDate={bounds.maxDate}
        onChange={setPeriod}
      />
      {error ? <p className="banner error">{error}</p> : null}

      {empty ? (
        <div className="empty-card">
          <h2>Brak wydatków w tym okresie</h2>
          <p>Zmień zakres dat albo zaimportuj historię.</p>
        </div>
      ) : (
        <>
          {chart.months.length ? (
            <article className="card trend-card">
              <div className="card-head">
                <div>
                  <h2>Wydatki kategorii w czasie</h2>
                  <p className="card-sub">
                    Najedź na wykres, żeby zobaczyć kwoty · kliknij kategorię w legendzie, żeby zostawić tylko ją
                  </p>
                </div>
                <div className="trend-tools">
                  <label
                    className="inline-check"
                    title="Duże jednorazowe kwoty spłaszczają resztę wykresu — oś zostaje przycięta do typowych wartości"
                  >
                    <input type="checkbox" checked={clipOutliers} onChange={(e) => setClipOutliers(e.target.checked)} />
                    Przytnij skrajne
                  </label>
                  <label className="ymax-field">
                    Oś Y do
                    <input
                      inputMode="decimal"
                      placeholder="zł"
                      value={yMaxInput}
                      onChange={(e) => setYMaxInput(e.target.value)}
                    />
                  </label>
                  {hidden.size ? (
                    <button type="button" className="ghost sm" onClick={() => setHidden(new Set())}>
                      Pokaż wszystkie
                    </button>
                  ) : null}
                </div>
              </div>
              <TrendLines
                months={chart.months}
                series={chart.series}
                hidden={hidden}
                onLegend={isolate}
                yMax={yMax}
              />
            </article>
          ) : null}

          {bounds.minDate ? (
            <AiEvaluation variant="strip" period={period} disabled={empty} onSetup={() => onNavigate("categories")} />
          ) : null}

          {leftover.length ? (
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Ile zostaje</h2>
                  <p className="card-sub">
                    Przychody minus wydatki — tu liczy się też to, co jest poza statystykami
                  </p>
                </div>
              </div>
              <div className="leftover">
                <dl className="stat-list">
                  <div>
                    <dt>Suma w okresie</dt>
                    <dd className={leftoverSum >= 0 ? "pos" : "neg"}>{money(leftoverSum)}</dd>
                  </div>
                  <div>
                    <dt>Średnio na miesiąc</dt>
                    <dd className={average >= 0 ? "pos" : "neg"}>{money(average)}</dd>
                  </div>
                  <div>
                    <dt>Ostatni miesiąc{lastLeft ? ` · ${monthLabel(lastLeft.month)}` : ""}</dt>
                    <dd className={(lastLeft?.net || 0) >= 0 ? "pos" : "neg"}>{lastLeft ? money(lastLeft.net) : "—"}</dd>
                  </div>
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

          {chart.months.length ? (
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
                      {chart.months.map((month) => (
                        <th key={month} className="num">
                          {columnLabel(month)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
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
                            <td key={chart.months[index]} className="num">
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
        </>
      )}
    </section>
  );
}
