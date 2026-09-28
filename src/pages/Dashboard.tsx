import { useEffect, useState } from "react";
import { api } from "../api";
import { AiEvaluation } from "../components/AiEvaluationCard";
import { AmountBars, CategoryBars, Donut, MonthBars, WeekdayBars } from "../components/Charts";
import { Icon } from "../components/Icon";
import { DownloadButton, type Navigate } from "../components/Layout";
import { PaymentPanel, type PaySort } from "../components/PaymentPanel";
import { PeriodBar, allPeriod, latestMonthPeriod, type Period } from "../components/PeriodBar";
import { WEEKDAY_NAMES, bucketQuery, describePeriod, money, percent, previousComparable } from "../format";
import type { AppInfo, Stats, Transaction } from "../types";

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

export function Dashboard({
  onNavigate,
  appInfo,
  onDemoCreated,
}: {
  onNavigate: Navigate;
  appInfo: AppInfo;
  onDemoCreated: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [previous, setPrevious] = useState<{ key: string; stats: Stats } | null>(null);
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<PaySort>("amount_desc");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [amountBucket, setAmountBucket] = useState("");
  const [weekday, setWeekday] = useState<number | null>(null);
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

  const activeBucket = stats?.byAmount.find((slice) => slice.id === amountBucket);

  function transactionQuery() {
    return {
      ...period,
      sort,
      kind: activeBucket || weekday != null ? ("expense" as const) : ("all" as const),
      category: categoryFilter.length ? categoryFilter.join(",") : undefined,
      weekday: weekday ?? undefined,
      ...bucketQuery(activeBucket),
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
  }, [period.from, period.to, sort, categoryFilter, activeBucket?.id, weekday]);

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
  const listFiltered = filtering || Boolean(amountBucket) || weekday != null;
  const weekdayIndex = stats.byWeekday.findIndex((day) => day.id === weekday);

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

  async function generateDemo() {
    setGenerating(true);
    try {
      await api.importDemo();
      await onDemoCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wygenerować danych");
      setGenerating(false);
    }
  }

  if (emptyAll) {
    return (
      <section className="page">
        {header}
        <div className="empty-card">
          <h2>{appInfo.hosted ? "Wypróbuj aplikację" : "Brak zaimportowanych danych"}</h2>
          <p>
            {appInfo.hosted
              ? "Wygeneruj konto testowe z 6 miesiącami przykładowych płatności albo wgraj własny CSV z banku. Dane są tymczasowe i widzisz je tylko Ty."
              : "Wgraj CSV z bankowości albo połącz konto przez Open Banking — wykresy pojawią się od razu. Możesz też najpierw obejrzeć przykładowe dane."}
          </p>
          <div className="row">
            <button type="button" className="primary" disabled={generating} onClick={() => void generateDemo()}>
              <Icon name="file" size={16} />
              {generating ? "Generuję…" : "Wygeneruj dane testowe"}
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate("import")}>
              Importuj historię
            </button>
            {appInfo.hosted ? (
              appInfo.downloadUrl ? <DownloadButton url={appInfo.downloadUrl} quiet /> : null
            ) : (
              <button type="button" className="ghost" onClick={() => onNavigate("settings", "bank")}>
                Połącz z bankiem
              </button>
            )}
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
                {stats.excludedCount ? (
                  <div title="Ukryte płatności nie liczą się do wydatków, wykresów ani limitów">
                    <dt>Ukryte</dt>
                    <dd className="muted">
                      {stats.excludedCount} · {money(stats.excludedSpend)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <AiEvaluation
                period={period}
                onSetup={() => onNavigate("settings", "ai")}
                filters={{
                  category: filtering ? categoryFilter.join(",") : undefined,
                  kind: activeBucket ? "expense" : undefined,
                  ...bucketQuery(activeBucket),
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
                <p className="card-sub">suma wydatków · kliknij, żeby filtrować</p>
              </div>
              {stats.byWeekday?.some((day) => day.amount) ? (
                <WeekdayBars
                  days={stats.byWeekday}
                  selected={weekday}
                  onSelect={(id) => setWeekday((current) => (current === id ? null : id))}
                />
              ) : (
                <p className="muted">Brak wydatków.</p>
              )}
            </article>
            <article className="card mini-card">
              <div className="card-head">
                <h2>Wielkość płatności</h2>
                <p className="card-sub">
                  kliknij, żeby filtrować ·{" "}
                  <button type="button" className="link-btn quiet" onClick={() => onNavigate("settings", "charts")}>
                    zmień przedziały
                  </button>
                </p>
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
        </div>

        <PaymentPanel
          items={items}
          sort={sort}
          onSort={setSort}
          categories={categories}
          categoryFilter={categoryFilter}
          onClearFilter={() => setCategoryFilter([])}
          onRemoveCategory={(name) => setCategoryFilter((current) => current.filter((item) => item !== name))}
          amountFilter={activeBucket?.label}
          onClearAmount={() => setAmountBucket("")}
          weekdayFilter={weekdayIndex >= 0 ? WEEKDAY_NAMES[weekdayIndex] : undefined}
          onClearWeekday={() => setWeekday(null)}
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
          onExcludedChange={async (item, excluded) => {
            setItems((current) => current.map((row) => (row.id === item.id ? { ...row, excluded } : row)));
            try {
              await api.setExcluded(item.id, excluded);
              setStats(await api.stats(period));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Nie zapisano zmiany");
              await reloadItems();
            }
          }}
        />
      </div>
    </section>
  );
}
