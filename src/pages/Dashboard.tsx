import { useEffect, useState } from "react";
import { api } from "../api";
import { AiEvaluationCard } from "../components/AiEvaluationCard";
import { AmountColumns, Bars, CategoryColumns, Donut, WeekdayBars } from "../components/Charts";
import { CategoryLimits } from "../components/CategoryLimits";
import { PaymentPanel, type PaySort } from "../components/PaymentPanel";
import { PeriodBar, applyPreset, type Period } from "../components/PeriodBar";
import { AMOUNT_BUCKET_QUERY, money } from "../format";
import type { Stats, Transaction } from "../types";

function withCategory(names: string[], next: string) {
  if (names.includes(next)) return names;
  return [...names.filter((name) => name !== "Inne"), next, "Inne"];
}

export function Dashboard({ onImport }: { onImport: () => void }) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<PaySort>("amount_desc");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [amountBucket, setAmountBucket] = useState("");
  const [chartType, setChartType] = useState<"bars" | "pie">("bars");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .meta()
      .then((meta) => {
        setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
        setPeriod((current) =>
          current.from ? current : applyPreset("month", meta.minDate, meta.maxDate),
        );
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period.from && !period.to) return;
    const bucket = amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {};
    Promise.all([
      api.stats(period),
      api.transactions({
        ...period,
        sort,
        kind: amountBucket ? "expense" : "all",
        category: categoryFilter.length ? categoryFilter.join(",") : undefined,
        ...bucket,
      }),
    ])
      .then(([nextStats, data]) => {
        setStats(nextStats);
        setItems(data.items);
        setCategories(data.categories);
      })
      .catch((err: Error) => setError(err.message));
  }, [period.from, period.to, sort, categoryFilter, amountBucket]);

  if (error) return <p className="banner error">{error}</p>;
  if (!stats) return <p className="muted">Ładowanie…</p>;

  const selectedSlices = categoryFilter.length
    ? stats.byCategory.filter((slice) => categoryFilter.includes(slice.category))
    : [];
  const selectedNet = selectedSlices.reduce((sum, slice) => sum + slice.amount, 0);

  function pickCategory(category: string, additive: boolean) {
    setCategoryFilter((current) => {
      if (additive) {
        return current.includes(category)
          ? current.filter((name) => name !== category)
          : [...current, category];
      }
      if (current.length === 1 && current[0] === category) return [];
      return [category];
    });
  }
  const expenseCategories = stats.byCategory.filter((slice) => slice.amount < 0);
  const emptyAll = stats.totalAll === 0;
  const emptyPeriod = stats.count === 0;

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Analiza wydatków</p>
          <h1>Przegląd</h1>
        </div>
        <p className="muted">{stats.count} operacji w okresie</p>
      </header>

      <PeriodBar
        period={period}
        minDate={bounds.minDate}
        maxDate={bounds.maxDate}
        onChange={(next) => {
          setCategoryFilter([]);
          setAmountBucket("");
          setPeriod(next);
        }}
      />

      {emptyAll ? null : (
        <AiEvaluationCard
          period={period}
          disabled={emptyPeriod}
          filters={{
            category: categoryFilter.length ? categoryFilter.join(",") : undefined,
            kind: amountBucket ? "expense" : undefined,
            ...(amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {}),
          }}
        />
      )}

      {emptyAll ? (
        <div className="empty-card">
          <h2>Brak zaimportowanych danych</h2>
          <p>Wgraj CSV z iPKO albo połącz konto przez Open Banking.</p>
          <button className="primary" onClick={onImport}>
            Importuj historię
          </button>
        </div>
      ) : emptyPeriod ? (
        <div className="empty-card">
          <h2>Brak transakcji w tym okresie</h2>
          <p>
            W bazie jest {stats.totalAll} operacji. Zmień zakres dat albo wybierz „Cały okres”.
          </p>
        </div>
      ) : (
        <>
          <div className="kpis">
            <article className="kpi">
              <span>{categoryFilter.length ? "Suma kategorii" : "Wydatki"}</span>
              <strong
                className={
                  categoryFilter.length ? (selectedNet >= 0 ? "pos" : "neg") : undefined
                }
              >
                {money(categoryFilter.length ? selectedNet : stats.expenses)}
              </strong>
            </article>
            <article className="kpi income">
              <span>Przychody</span>
              <strong>{money(stats.income)}</strong>
            </article>
            <article className="kpi">
              <span>Na plus / minus</span>
              <strong className={(categoryFilter.length ? selectedNet : stats.net) >= 0 ? "pos" : "neg"}>
                {money(categoryFilter.length ? selectedNet : stats.net)}
              </strong>
            </article>
            <article className="kpi">
              <span>Transakcje</span>
              <strong>{categoryFilter.length ? items.length : stats.count}</strong>
            </article>
          </div>

          <CategoryLimits
            items={stats.limits || []}
            months={stats.limitMonths || 1}
            selected={categoryFilter}
            onSelect={pickCategory}
          />

          <div className="overview">
            <div className="stack">
              <article className="card">
                <div className="card-head">
                  <h2>Wydatki według kategorii</h2>
                  <div className="chart-toggle">
                    <button
                      type="button"
                      className={chartType === "bars" ? "active" : undefined}
                      onClick={() => setChartType("bars")}
                    >
                      Kolumny
                    </button>
                    <button
                      type="button"
                      className={chartType === "pie" ? "active" : undefined}
                      onClick={() => setChartType("pie")}
                    >
                      Kołowy
                    </button>
                  </div>
                </div>
                <p className="muted chart-hint">
                  {chartType === "pie"
                    ? "Udział w wydatkach. Ctrl+klik dodaje kolejną kategorię — suma u góry się aktualizuje."
                    : "Kliknij słupek. Ctrl+klik dodaje kolejne kategorie i sumuje je w kafelku u góry."}
                </p>
                {expenseCategories.length ? (
                  chartType === "pie" ? (
                    <Donut slices={expenseCategories} selected={categoryFilter} onSelect={pickCategory} />
                  ) : (
                    <CategoryColumns
                      compact
                      slices={expenseCategories}
                      selected={categoryFilter}
                      limits={stats.limits}
                      onSelect={pickCategory}
                    />
                  )
                ) : (
                  <p className="muted">Brak wydatków w tym okresie.</p>
                )}
              </article>
              <article className="card">
                <h2>Miesiące w wybranym okresie</h2>
                <Bars months={stats.byMonth} />
                <p className="muted bar-caption">
                  <span className="dot income" /> przychody
                  <span className="dot expense" /> wydatki
                </p>
              </article>
              <article className="card">
                <h2>Którego dnia schodzi kasa</h2>
                <p className="muted chart-hint">
                  Suma wydatków w tym okresie według dnia tygodnia — widać, czy dziura jest w piątki, czy w weekend.
                </p>
                {stats.byWeekday?.some((day) => day.amount) ? (
                  <WeekdayBars days={stats.byWeekday} />
                ) : (
                  <p className="muted">Brak wydatków w tym okresie.</p>
                )}
              </article>
              <article className="card">
                <h2>Wydatki według kwoty</h2>
                <p className="muted chart-hint">Kliknij kolumnę, żeby zobaczyć płatności w tym przedziale.</p>
                {stats.byAmount.some((slice) => slice.count) ? (
                  <AmountColumns
                    slices={stats.byAmount}
                    selected={amountBucket}
                    onSelect={(id) => setAmountBucket((current) => (current === id ? "" : id))}
                  />
                ) : (
                  <p className="muted">Brak wydatków w tym okresie.</p>
                )}
              </article>
            </div>
            <PaymentPanel
              items={items}
              sort={sort}
              onSort={setSort}
              categories={categories}
              categoryFilter={categoryFilter}
              onClearFilter={() => setCategoryFilter([])}
              onRemoveCategory={(name) =>
                setCategoryFilter((current) => current.filter((item) => item !== name))
              }
              amountFilter={stats.byAmount.find((slice) => slice.id === amountBucket)?.label}
              onClearAmount={() => setAmountBucket("")}
              onCategoryChange={async (item, next, scope) => {
                setItems((current) =>
                  current.map((row) => {
                    if (row.id === item.id) return { ...row, category: next };
                    if (
                      scope === "merchant" &&
                      item.payee &&
                      row.payee.toLowerCase() === item.payee.toLowerCase()
                    ) {
                      return { ...row, category: next };
                    }
                    return row;
                  }),
                );
                setCategories((current) => withCategory(current, next));
                try {
                  await api.updateCategory(item.id, next, { onlyThis: scope === "one" });
                  setStats(await api.stats(period));
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Nie zapisano kategorii");
                  const bucket = amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {};
                  const data = await api.transactions({
                    ...period,
                    sort,
                    kind: amountBucket ? "expense" : "all",
                    category: categoryFilter.length ? categoryFilter.join(",") : undefined,
                    ...bucket,
                  });
                  setItems(data.items);
                  setCategories(data.categories);
                }
              }}
              onCommentChange={async (item, next) => {
                setItems((current) =>
                  current.map((row) => (row.id === item.id ? { ...row, comment: next } : row)),
                );
                try {
                  await api.updateComment(item.id, next);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Nie zapisano komentarza");
                  const bucket = amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {};
                  const data = await api.transactions({
                    ...period,
                    sort,
                    kind: amountBucket ? "expense" : "all",
                    category: categoryFilter.length ? categoryFilter.join(",") : undefined,
                    ...bucket,
                  });
                  setItems(data.items);
                }
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
