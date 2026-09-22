import { categoryColor, money, percent } from "../format";
import type { CategoryBudget } from "../types";

export function CategoryLimits({
  items,
  months,
  selected,
  onSelect,
}: {
  items: CategoryBudget[];
  months: number;
  selected?: string[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selected || [];
  const over = items.filter((row) => row.status === "over");
  const scaled = Math.abs(months - 1) > 0.04;

  return (
    <article className="card limit-card">
      <div className="card-head">
        <h2>Limity kategorii</h2>
        {over.length ? (
          <p className="limit-over-count">{over.length} ponad limit</p>
        ) : (
          <p className="muted">Limit miesięczny</p>
        )}
      </div>
      <p className="muted chart-hint">
        {scaled
          ? `W tym widoku limit jest × ${months.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} względem miesiąca.`
          : "Słupek porównuje wydatki w tym okresie z limitem. Kliknij kategorię, żeby zobaczyć płatności."}
      </p>
      {!items.length ? (
        <p className="muted">Ustaw limit zł / miesiąc przy kategoriach — potem tu widać, czy został przekroczony.</p>
      ) : (
        <ul className="limit-list">
          {items.map((row) => {
            const fill = Math.min(100, row.ratio * 100);
            return (
              <li key={row.category}>
                <button
                  type="button"
                  className={
                    picked.includes(row.category)
                      ? `limit-row selected ${row.status}`
                      : `limit-row ${row.status}`
                  }
                  onClick={(event) => onSelect?.(row.category, event.ctrlKey || event.metaKey)}
                >
                  <span className="limit-dot" style={{ background: categoryColor(row.category) }} />
                  <span className="limit-copy">
                    <strong>{row.category}</strong>
                    <em>
                      {money(row.spent)} z {money(row.allowed)}
                      {row.status === "over"
                        ? ` · ${money(Math.abs(row.remaining))} ponad`
                        : ` · zostaje ${money(row.remaining)}`}
                    </em>
                  </span>
                  <span className={`limit-pct ${row.status}`}>{percent(row.spent, row.allowed)}</span>
                  <span className="limit-track" aria-hidden>
                    <span className={`limit-fill ${row.status}`} style={{ width: `${fill}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
