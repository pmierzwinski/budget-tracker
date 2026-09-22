import { useEffect, useState } from "react";
import { api } from "../api";
import { AiEvaluation } from "../components/AiEvaluationCard";
import { AmountBars, CategoryBars, Donut, MonthBars, WeekdayBars } from "../components/Charts";
import { CategoryLimits } from "../components/CategoryLimits";
import { Icon } from "../components/Icon";
import type { Page } from "../components/Layout";
import { PaymentPanel, type PaySort } from "../components/PaymentPanel";
import { PeriodBar, allPeriod, latestMonthPeriod, type Period } from "../components/PeriodBar";
import { AMOUNT_BUCKET_QUERY, describePeriod, money, percent, previousComparable } from "../format";
import type { Stats, Transaction } from "../types";

function withCategory(names: string[], next: string) {
  if (names.includes(next)) return names;
  return [...names.filter((name) => name !== "Inne"), next, "Inne"];
}

function spendOf(stats: Stats, categories: string[]): number {
  if (!categories.length) return stats.expenses;
  return -stats.byCategory
    .filter((slice) => categories.includes(slice.category))
    .reduce((sum, slice) => sum + slice.amount, 0);
}

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) return null;
  const diff = current - previous;
  const flat = Math.abs(diff / previous) < 0.005;
  const direction = flat ? "" : diff > 0 ? " up" : " down";
  return (
    <p
      className={`hero-delta${direction}`}
      title={`${label}: ${money(previous)} · różnica ${diff > 0 ? "+" : ""}${money(diff)}`}
    >
      <span aria-hidden>{flat ? "=" : diff > 0 ? "▲" : "▼"}</span>
      {flat ? "tyle samo" : `${diff > 0 ? "+" : "−"}${percent(Math.abs(diff), previous)}`}
      <span className="muted"> vs {label}</span>
    </p>
  );
}

export function Dashboard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [previous, setPrevious] = useState<{ key: string; stats: Stats } | null>(null);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<PaySort>("amount_desc");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [amountBucket, setAmountBucket] = useState("");
  const [chartType, setChartType] = useState<"bars" | "pie">("bars");
  const [error, setError] = useState("");

  const info = describePeriod(period, bounds.minDate, bounds.maxDate);
  const comparison = info.kind === "all" ? null : previousComparable(period, bounds.maxDate);
  const comparisonKey = comparison ? `${comparison.period.from}|${comparison.period.to}` : "";

  useEffect(() => {
    api
      .meta()
      .then((meta) => {
        setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
        setPeriod((current) => (current.from ? current : latestMonthPeriod(meta.maxDate)));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period.from && !period.to) return;
    let alive = true;
    api
      .stats(period)
      .then((next) => alive && setStats(next))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period.from, period.to]);

  useEffect(() => {
    if (!comparisonKey) return;
    const [from, to] = comparisonKey.split("|");
    let alive = true;
    api
      .stats({ from, to })
      .then((next) => alive && setPrevious({ key: comparisonKey, stats: next }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [comparisonKey]);

  function transactionQuery() {
    return {
      ...period,
      sort,
      kind: amountBucket ? ("expense" as const) : ("all" as const),
      category: categoryFilter.length ? categoryFilter.join(",") : undefined,
      ...(amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {}),
    };
  }

  async function reloadItems() {
    const data = await api.transactions(transactionQuery());
    setItems(data.items);
    setCategories(data.categories);
  }

  useEffect(() => {
    if (!period.from && !period.to) return;
    let alive = true;
    api
      .transactions(transactionQuery())
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setCategories(data.categories);
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period.from, period.to, sort, categoryFilter, amountBucket]);

  if (!stats) return error ? <p className="banner error">{error}</p> : <p className="muted loading">Ładowanie…</p>;

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
  const expenseNames = expenseCategories.map((slice) => slice.category);
  const emptyAll = stats.totalAll === 0;
  const emptyPeriod = stats.count === 0;
  const filtering = categoryFilter.length > 0;
  const heroValue = spendOf(stats, categoryFilter);
  const previousStats = previous && previous.key === comparisonKey ? previous.stats : null;
  const listFiltered = filtering || Boolean(amountBucket);

  const header = (
    <>
      <PeriodBar
        page="Przegląd"
        period={period}
        minDate={bounds.minDate}
        maxDate={bounds.maxDate}
        onChange={setPeriod}
      />
      {error ? (
        <p className="banner error dismissible">
          {error}
          <button type="button" className="icon-btn" aria-label="Zamknij" onClick={() => setError("")}>
            <Icon name="close" size={16} />
          </button>
        </p>
      ) : null}
    </>
  );

  if (emptyAll) {
    return (
      <section className="page">
        {header}
        <div className="empty-card">
          <h2>Brak zaimportowanych danych</h2>
          <p>Wgraj CSV z iPKO albo połącz konto przez Open Banking — wykresy pojawią się od razu.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => onNavigate("import")}>
              Importuj historię
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate("bank")}>
              Połącz z PKO
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (emptyPeriod) {
    return (
      <section className="page">
        {header}
        <div className="empty-card">
          <h2>Brak transakcji w tym okresie</h2>
          <p>W bazie jest {stats.totalAll} operacji — wybierz okres, w którym coś się działo.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => setPeriod(latestMonthPeriod(bounds.maxDate))}>
              Ostatni miesiąc z danymi
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setPeriod(allPeriod(bounds.minDate, bounds.maxDate))}
            >
              Cały okres
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page dash">
      {header}
      <div className="dash-grid">
        <div className="dash-main">
          <article className="card hero">
            <div className="hero-summary">
              <div className="hero-kpi">
                <div className="hero-label">
                  <span>
                    {filtering
                      ? categoryFilter.length === 1
                        ? categoryFilter[0]
                        : `${categoryFilter.length} kategorie`
                      : "Wydatki"}
                  </span>
                  {filtering ? (
                    <button type="button" className="link-btn quiet" onClick={() => setCategoryFilter([])}>
                      <Icon name="close" size={13} />
                      wszystkie
                    </button>
                  ) : null}
                </div>
                <strong className="hero-value">{money(heroValue)}</strong>
                {filtering ? (
                  <p className="hero-share">{percent(heroValue, spendOf(stats, expenseNames))} wydatków w kategoriach</p>
                ) : null}
                {previousStats && comparison ? (
                  <Delta
                    current={heroValue}
                    previous={spendOf(previousStats, categoryFilter)}
                    label={comparison.label}
                  />
                ) : null}
              </div>
              <dl className="hero-stats">
                <div>
                  <dt>Przychody</dt>
                  <dd className="pos">{money(stats.income)}</dd>
                </div>
                <div>
                  <dt>Bilans</dt>
                  <dd className={stats.net >= 0 ? "pos" : "neg"}>
                    {stats.net > 0 ? "+" : ""}
                    {money(stats.net)}
                  </dd>
                </div>
                <div>
                  <dt>Transakcje</dt>
                  <dd>{listFiltered ? `${items.length} z ${stats.count}` : stats.count}</dd>
                </div>
              </dl>
              <AiEvaluation
                period={period}
                onSetup={() => onNavigate("categories")}
                filters={{
                  category: filtering ? categoryFilter.join(",") : undefined,
                  kind: amountBucket ? "expense" : undefined,
                  ...(amountBucket ? AMOUNT_BUCKET_QUERY[amountBucket] : {}),
                }}
              />
            </div>
            <div className="hero-chart">
              <div className="card-head">
                <div>
                  <h2>Wydatki według kategorii</h2>
                  <p className="card-sub">Kliknij kategorię, żeby zobaczyć jej płatności · Ctrl+klik — kilka naraz</p>
                </div>
                <div className="segmented sm" role="group" aria-label="Typ wykresu">
                  <button
                    type="button"
                    className={chartType === "bars" ? "active" : undefined}
                    aria-pressed={chartType === "bars"}
                    onClick={() => setChartType("bars")}
                  >
                    Słupki
                  </button>
                  <button
                    type="button"
                    className={chartType === "pie" ? "active" : undefined}
                    aria-pressed={chartType === "pie"}
                    onClick={() => setChartType("pie")}
                  >
                    Kołowy
                  </button>
                </div>
              </div>
              {!expenseCategories.length ? (
                <p className="muted">Brak wydatków w tym okresie.</p>
              ) : chartType === "pie" ? (
                <Donut slices={expenseCategories} selected={categoryFilter} onSelect={pickCategory} />
              ) : (
                <CategoryBars
                  slices={expenseCategories}
                  selected={categoryFilter}
                  limits={stats.limits}
                  onSelect={pickCategory}
                />
              )}
            </div>
          </article>

          <div className="mini-charts">
            <article className="card mini-card">
              <div className="card-head">
                <h2>Dni tygodnia</h2>
                <p className="card-sub">suma wydatków</p>
              </div>
              {stats.byWeekday?.some((day) => day.amount) ? (
                <WeekdayBars days={stats.byWeekday} />
              ) : (
                <p className="muted">Brak wydatków.</p>
              )}
            </article>
            <article className="card mini-card">
              <div className="card-head">
                <h2>Wielkość płatności</h2>
                <p className="card-sub">kliknij, żeby filtrować</p>
              </div>
              {stats.byAmount.some((slice) => slice.count) ? (
                <AmountBars
                  slices={stats.byAmount}
                  selected={amountBucket}
                  onSelect={(id) => setAmountBucket((current) => (current === id ? "" : id))}
                />
              ) : (
                <p className="muted">Brak wydatków.</p>
              )}
            </article>
            {stats.byMonth.length > 1 ? (
              <article className="card mini-card wide">
                <div className="card-head">
                  <h2>Miesiące</h2>
                  <p className="card-sub">przychody i wydatki</p>
                </div>
                <MonthBars months={stats.byMonth} />
              </article>
            ) : null}
          </div>

          {stats.limits?.length ? (
            <CategoryLimits
              items={stats.limits}
              months={stats.limitMonths || 1}
              selected={categoryFilter}
              onSelect={pickCategory}
            />
          ) : null}
        </div>

        <PaymentPanel
          items={items}
          sort={sort}
          onSort={setSort}
          categories={categories}
          categoryFilter={categoryFilter}
          onClearFilter={() => setCategoryFilter([])}
          onRemoveCategory={(name) => setCategoryFilter((current) => current.filter((item) => item !== name))}
          amountFilter={stats.byAmount.find((slice) => slice.id === amountBucket)?.label}
          onClearAmount={() => setAmountBucket("")}
          onCategoryChange={async (item, next, scope) => {
            setItems((current) =>
              current.map((row) => {
                if (row.id === item.id) return { ...row, category: next };
                if (scope === "merchant" && item.payee && row.payee.toLowerCase() === item.payee.toLowerCase()) {
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
              await reloadItems();
            }
          }}
          onCommentChange={async (item, next) => {
            setItems((current) => current.map((row) => (row.id === item.id ? { ...row, comment: next } : row)));
            try {
              await api.updateComment(item.id, next);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Nie zapisano komentarza");
              await reloadItems();
            }
          }}
        />
      </div>
    </section>
  );
}
