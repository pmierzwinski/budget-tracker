import type { MouseEvent } from "react";
import { categoryColor } from "../../colors";
import { money, percent } from "../../format";
import type { CategoryBudget } from "../../types";

type Slice = { category: string; amount: number };

/** Expense slices (category balance < 0) as positive spend, with their total (never 0). */
function spendSlices(slices: Slice[]) {
  const rows = slices
    .filter((slice) => slice.amount < 0)
    .map((slice) => ({ category: slice.category, spend: -slice.amount }));
  return { rows, total: rows.reduce((sum, row) => sum + row.spend, 0) || 1 };
}

/** Ctrl/⌘+click adds to the selection instead of replacing it. */
function additive(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

export function CategoryBars({
  slices,
  selected,
  limits,
  onSelect,
}: {
  slices: Slice[];
  selected?: string[];
  limits?: CategoryBudget[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selected || [];
  const { rows, total } = spendSlices(slices);
  const max = Math.max(1, ...rows.map((row) => row.spend));
  const limitByName = new Map((limits || []).map((row) => [row.category, row]));
  const withLimits = rows.some((row) => limitByName.has(row.category));

  return (
    <ul className={withLimits ? "hbars has-limits" : "hbars"}>
      {rows.map((row) => {
        const limit = limitByName.get(row.category);
        const active = picked.includes(row.category);
        const color = categoryColor(row.category);
        const classes = ["hbar", active ? "selected" : "", picked.length && !active ? "dimmed" : ""];
        return (
          <li key={row.category}>
            <button
              type="button"
              className={classes.filter(Boolean).join(" ")}
              aria-pressed={active}
              title={`${row.category}: ${money(row.spend)} (${percent(row.spend, total)} wydatków)${
                limit ? ` · limit ${money(limit.allowed)}` : ""
              }`}
              onClick={(event) => onSelect?.(row.category, additive(event))}
            >
              <span className="hbar-name">
                <span className="hbar-dot" style={{ background: color }} />
                <span className="hbar-label">{row.category}</span>
              </span>
              <span className="hbar-track">
                <span
                  className="hbar-fill"
                  style={{ width: `${Math.max(0.8, (row.spend / max) * 100)}%`, background: color }}
                />
              </span>
              <span className="hbar-amount">{money(row.spend)}</span>
              <span className="hbar-pct">{percent(row.spend, total)}</span>
              {withLimits ? (
                <span className={limit ? `hbar-limit ${limit.status}` : "hbar-limit"}>
                  {limit ? `${percent(limit.ratio, 1)} limitu` : ""}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Donut({
  slices,
  selected,
  onSelect,
}: {
  slices: Slice[];
  selected?: string[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selected || [];
  const { rows: pie, total } = spendSlices(slices);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const selectedSpend = picked.length
    ? pie.filter((slice) => picked.includes(slice.category)).reduce((sum, slice) => sum + slice.spend, 0)
    : total;
  const selectedLabel =
    picked.length === 1 ? picked[0] : picked.length > 1 ? `${picked.length} kategorie` : "wszystkich wydatków";

  return (
    <div className="donut-wrap">
      <div className="donut-frame">
        <svg viewBox="0 0 120 120" className="donut">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#eef0f3" strokeWidth="14" />
          {pie.map((slice) => {
            const length = (slice.spend / total) * circumference;
            const dimmed = Boolean(picked.length && !picked.includes(slice.category));
            const circle = (
              <circle
                key={slice.category}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={categoryColor(slice.category)}
                strokeWidth="14"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                opacity={dimmed ? 0.25 : 1}
                transform="rotate(-90 60 60)"
                style={{ cursor: onSelect ? "pointer" : undefined }}
                onClick={(event) => onSelect?.(slice.category, additive(event))}
              >
                <title>{`${slice.category}: ${money(slice.spend)} (${percent(slice.spend, total)})`}</title>
              </circle>
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="donut-center">
          <strong>{percent(selectedSpend, total)}</strong>
          <span>{selectedLabel}</span>
        </div>
      </div>
      <ul className="legend">
        {pie.map((slice) => (
          <li key={slice.category}>
            <button
              type="button"
              className={picked.includes(slice.category) ? "legend-btn active" : "legend-btn"}
              onClick={(event) => onSelect?.(slice.category, additive(event))}
            >
              <span style={{ background: categoryColor(slice.category) }} />
              {slice.category}
              <em>
                {money(slice.spend)} · {percent(slice.spend, total)}
              </em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
