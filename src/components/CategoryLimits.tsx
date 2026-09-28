import { categoryColor, money, percent } from "../format";
import type { CategoryBudget } from "../types";

export function CategoryLimits({
  items,
  months,
  selected,
  onSelect,
  onManage,
  title = "Limity kategorii",
}: {
  items: CategoryBudget[];
  months: number;
  selected?: string[];
  onSelect?: (category: string, additive: boolean) => void;
  onManage?: () => void;
  title?: string;
}) {
  const picked = selected || [];
  const over = items.filter((row) => row.status === "over");
  const scaled = Math.abs(months - 1) > 0.04;

  return (
    <article className="card limit-card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p className="card-sub">
            {scaled
              ? `Limit miesięczny × ${months.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} (długość okresu)`
              : "Wydatki w tym okresie względem limitu miesięcznego"}
          </p>
        </div>
        <div className="row">
          {over.length ? <span className="pill over">{over.length} ponad limit</span> : null}
          {onManage ? (
            <button type="button" className="link-btn" onClick={onManage}>
              Zarządzaj limitami
            </button>
          ) : null}
        </div>
      </div>
      {!items.length ? (
        <p className="muted">Ustaw limit zł / miesiąc przy kategoriach — potem tu widać, czy został przekroczony.</p>
      ) : (
        <ul className="limit-list">
          {items.map((row) => {
            const fill = Math.min(100, row.ratio * 100);
            const classes = `limit-row${onSelect ? "" : " static"}${picked.includes(row.category) ? " selected" : ""} ${row.status}`;
            const body = (
              <>
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
              </>
            );
            return (
              <li key={row.category}>
                {onSelect ? (
                  <button
                    type="button"
                    className={classes}
                    aria-pressed={picked.includes(row.category)}
                    onClick={(event) => onSelect(row.category, event.ctrlKey || event.metaKey)}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={classes}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
