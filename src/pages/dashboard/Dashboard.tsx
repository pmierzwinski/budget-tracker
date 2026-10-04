import { useState } from "react";
import { bucketQuery } from "../../modules/shared/domain.ts";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { AiEvaluation } from "../../components/AiEvaluationCard";
import { EmptyPeriod } from "../../components/EmptyPeriod";
import { PaymentPanel, type PaySort } from "../../components/PaymentPanel";
import { PeriodBar } from "../../components/PeriodBar";
import { Notices } from "../../components/ui/Notices";
import { WEEKDAY_NAMES } from "../../format";
import { useAsync } from "../../hooks/useAsync";
import { useComparison } from "../../hooks/useComparison";
import { usePeriod } from "../../hooks/usePeriod";
import { useTransactionEdits } from "../../hooks/useTransactionEdits";
import { useTransactionList } from "../../hooks/useTransactionList";
import { CategoryChartCard } from "./CategoryChartCard";
import { HeroSummary } from "./HeroSummary";
import { MiniCharts } from "./MiniCharts";
import { NoDataYet } from "./NoDataYet";

/** Plain click picks one category (again = none), Ctrl/⌘+click adds or removes it. */
function toggleCategory(current: string[], category: string, additive: boolean): string[] {
  if (additive) return current.includes(category) ? current.filter((name) => name !== category) : [...current, category];
  return current.length === 1 && current[0] === category ? [] : [category];
}

export function Dashboard() {
  const { navigate } = useApp();
  const { period, setPeriod, bounds } = usePeriod("month");
  const [sort, setSort] = useState<PaySort>("amount_desc");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [amountBucket, setAmountBucket] = useState("");
  const [weekday, setWeekday] = useState<number | null>(null);
  const [error, setError] = useState("");

  const stats = useAsync(() => api.stats(period), [period.from, period.to]);
  const { comparison, previousStats } = useComparison(period, bounds);
  const activeBucket = stats.data?.byAmount.find((slice) => slice.id === amountBucket);
  const list = useTransactionList(
    () =>
      api.transactions({
        ...period,
        sort,
        kind: activeBucket || weekday != null ? "expense" : "all",
        category: categoryFilter.length ? categoryFilter.join(",") : undefined,
        weekday: weekday ?? undefined,
        ...bucketQuery(activeBucket),
      }),
    [period.from, period.to, sort, categoryFilter, activeBucket?.id, weekday],
  );
  const edits = useTransactionEdits({
    updateItems: list.updateItems,
    addCategory: list.addCategory,
    onSaved: (change) => {
      if (change.type !== "comment") stats.reload();
    },
    onFailed: (message) => {
      setError(message);
      list.reload();
    },
  });

  const shownError = error || stats.error || list.error;
  if (!stats.data) return shownError ? <p className="banner error">{shownError}</p> : <p className="muted loading">Ładowanie…</p>;
  const data = stats.data;

  const header = (
    <>
      <PeriodBar page="Przegląd" period={period} onChange={setPeriod} />
      <Notices error={shownError} onDismiss={() => setError("")} />
    </>
  );

  if (data.totalAll === 0) {
    return (
      <section className="page">
        {header}
        <NoDataYet onError={setError} />
      </section>
    );
  }

  if (data.count === 0) {
    return (
      <section className="page">
        {header}
        <EmptyPeriod title="Brak transakcji w tym okresie" totalAll={data.totalAll} onPeriod={setPeriod} />
      </section>
    );
  }

  const filtering = categoryFilter.length > 0;
  const listFiltered = filtering || Boolean(amountBucket) || weekday != null;
  const weekdayIndex = data.byWeekday.findIndex((day) => day.id === weekday);

  return (
    <section className="page dash">
      {header}
      <div className="dash-grid">
        <div className="dash-main">
          <article className="card hero">
            <HeroSummary
              stats={data}
              previousStats={previousStats}
              comparisonLabel={comparison?.label}
              categoryFilter={categoryFilter}
              onClearCategories={() => setCategoryFilter([])}
              shownCount={listFiltered ? list.items.length : null}
            />
            <CategoryChartCard
              stats={data}
              selected={categoryFilter}
              onSelect={(category, additive) => setCategoryFilter((current) => toggleCategory(current, category, additive))}
            />
            <div className="hero-ai">
              <AiEvaluation
                period={period}
                onSetup={() => navigate("settings", "ai")}
                filters={{
                  category: filtering ? categoryFilter.join(",") : undefined,
                  kind: activeBucket ? "expense" : undefined,
                  ...bucketQuery(activeBucket),
                }}
              />
            </div>
          </article>
          <MiniCharts
            stats={data}
            weekday={weekday}
            onWeekday={(id) => setWeekday((current) => (current === id ? null : id))}
            amountBucket={amountBucket}
            onAmountBucket={(id) => setAmountBucket((current) => (current === id ? "" : id))}
          />
        </div>

        <PaymentPanel
          items={list.items}
          sort={sort}
          onSort={setSort}
          categories={list.categories}
          categoryFilter={categoryFilter}
          onClearFilter={() => setCategoryFilter([])}
          onRemoveCategory={(name) => setCategoryFilter((current) => current.filter((item) => item !== name))}
          amountFilter={activeBucket?.label}
          onClearAmount={() => setAmountBucket("")}
          weekdayFilter={weekdayIndex >= 0 ? WEEKDAY_NAMES[weekdayIndex] : undefined}
          onClearWeekday={() => setWeekday(null)}
          onCategoryChange={(item, next, scope, options) => void edits.changeCategory(item, next, scope, options)}
          onCommentChange={(item, next) => void edits.changeComment(item, next)}
          onExcludedChange={(item, excluded) => void edits.changeExcluded(item, excluded)}
          loading={list.loading}
        />
      </div>
    </section>
  );
}
