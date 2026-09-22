import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AiEvaluationCard } from "../components/AiEvaluationCard";
import { TrendLines } from "../components/Charts";
import { PeriodBar, allPeriod, type Period } from "../components/PeriodBar";
import { money, monthLabel, percent, categoryColor } from "../format";
import type { Stats } from "../types";

function clipYMax(values: number[]) {
  const sorted = [...values].filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.9) - 1));
  return Math.max(sorted[index] * 1.08, 1);
}

export function Trends() {
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
    api
      .stats(period)
      .then((next) => {
        setStats(next);
        setHidden(new Set());
      })
      .catch((err: Error) => setError(err.message));
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
    return { months, series, totals };
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

  if (error) return <p className="banner error">{error}</p>;
  if (!stats) return <p className="muted">Ładowanie…</p>;

  const leftover = stats.byMonth.map((row) => ({
    ...row,
    net: row.income - row.expenses,
  }));
  const leftoverSum = leftover.reduce((sum, row) => sum + row.net, 0);
  const lastLeft = leftover[leftover.length - 1];

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Porównanie</p>
          <h1>Miesiąc do miesiąca</h1>
        </div>
        <p className="muted">Jak rosną wydatki w każdej kategorii</p>
      </header>

      <PeriodBar period={period} minDate={bounds.minDate} maxDate={bounds.maxDate} onChange={setPeriod} />

      {bounds.minDate ? <AiEvaluationCard period={period} disabled={!stats.byMonth.length && !chart.months.length} /> : null}

      {!stats.byMonth.length && !chart.months.length ? (
        <div className="empty-card">
          <h2>Brak wydatków w tym okresie</h2>
          <p>Zmień zakres dat albo zaimportuj historię.</p>
        </div>
      ) : (
        <>
          {chart.months.length ? (
            <article className="card">
              <div className="card-head">
                <h2>Wydatki kategorii w czasie</h2>
                <div className="trend-tools">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={clipOutliers}
                      onChange={(e) => setClipOutliers(e.target.checked)}
                    />
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
                    <button type="button" className="ghost" onClick={() => setHidden(new Set())}>
                      Pokaż wszystkie
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="muted chart-hint">
                Duże jednorazowe kwoty spłaszczają resztę wykresu. „Przytnij skrajne” obcina oś do typowych
                wartości. Albo wpisz ręczny limit. Kategoria <strong>Poza statystykami</strong> nie wchodzi do
                tego wykresu.
              </p>
              <TrendLines
                months={chart.months}
                series={chart.series}
                hidden={hidden}
                onLegend={isolate}
                yMax={yMax}
              />
            </article>
          ) : null}

          {leftover.length ? (
            <article className="card" style={{ marginTop: chart.months.length ? "1rem" : 0 }}>
              <h2>Ile zostaje</h2>
              <p className="muted chart-hint">
                Przychody minus wydatki w każdym miesiącu. Tu liczy się też to, co oznaczysz jako poza
                statystykami — to nadal prawdziwe pieniądze.
              </p>
              <div className="kpis compact">
                <article className="kpi">
                  <span>Suma w okresie</span>
                  <strong className={leftoverSum >= 0 ? "pos" : "neg"}>{money(leftoverSum)}</strong>
                </article>
                <article className="kpi">
                  <span>Ostatni miesiąc</span>
                  <strong className={(lastLeft?.net || 0) >= 0 ? "pos" : "neg"}>
                    {lastLeft ? money(lastLeft.net) : "—"}
                  </strong>
                </article>
                <article className="kpi">
                  <span>Średnio na miesiąc</span>
                  <strong className={leftoverSum / leftover.length >= 0 ? "pos" : "neg"}>
                    {money(leftoverSum / leftover.length)}
                  </strong>
                </article>
              </div>
              <div className="table-wrap">
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
                        <td className="num pos">{money(row.income)}</td>
                        <td className="num neg">{money(row.expenses)}</td>
                        <td className={row.net >= 0 ? "num pos" : "num neg"}>
                          <strong>{money(row.net)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {chart.months.length ? (
            <article className="card" style={{ marginTop: "1rem" }}>
            <h2>Kwoty i zmiana do poprzedniego miesiąca</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Kategoria</th>
                    {chart.months.map((month) => (
                      <th key={month} className="num">
                        {monthLabel(month)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.category}>
                      <td>
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
                            <strong>{money(value)}</strong>
                            {index > 0 && prev ? (
                              <p className={delta >= 0 ? "muted neg" : "muted pos"}>
                                {`${delta > 0 ? "+" : ""}${percent(value - prev, prev)}`}
                              </p>
                            ) : (
                              <p className="muted">—</p>
                            )}
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
