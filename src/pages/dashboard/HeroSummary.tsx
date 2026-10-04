import { Icon } from "../../components/Icon";
import { money, percent } from "../../format";
import type { Stats } from "../../types";
import { spendOf } from "./spend";

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

/** Spend KPI (all or the picked categories) with the change vs the previous period and totals. */
export function HeroSummary({
  stats,
  previousStats,
  comparisonLabel,
  categoryFilter,
  onClearCategories,
  shownCount,
}: {
  stats: Stats;
  previousStats: Stats | null;
  comparisonLabel?: string;
  categoryFilter: string[];
  onClearCategories: () => void;
  shownCount: number | null;
}) {
  const filtering = categoryFilter.length > 0;
  const heroValue = spendOf(stats, categoryFilter);
  const expenseNames = stats.byCategory.filter((slice) => slice.amount < 0).map((slice) => slice.category);
  return (
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
            <button type="button" className="link-btn quiet" onClick={onClearCategories}>
              <Icon name="close" size={13} />
              wszystkie
            </button>
          ) : null}
        </div>
        <strong className="hero-value">{money(heroValue)}</strong>
        {filtering ? (
          <p className="hero-share">{percent(heroValue, spendOf(stats, expenseNames))} wydatków w kategoriach</p>
        ) : null}
        {previousStats && comparisonLabel ? (
          <Delta current={heroValue} previous={spendOf(previousStats, categoryFilter)} label={comparisonLabel} />
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
          <dd>{shownCount != null ? `${shownCount} z ${stats.count}` : stats.count}</dd>
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
    </div>
  );
}
