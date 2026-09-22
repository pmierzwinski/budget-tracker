import { useState, type MouseEvent } from "react";
import { categoryColor, compactMoney, money, monthLabel, percent, shortMonthTick, WEEKDAY_LABELS } from "../format";

function selectedSet(selected?: string | string[]): string[] {
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export function CategoryColumns({
  slices,
  compact,
  selected,
  limits,
  onSelect,
}: {
  slices: { category: string; amount: number }[];
  compact?: boolean;
  selected?: string | string[];
  limits?: { category: string; ratio: number; status: "ok" | "warn" | "over" }[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selectedSet(selected);
  const shown = slices.filter((slice) => slice.amount < 0);
  const spendMax = Math.max(1, ...shown.map((slice) => -slice.amount));
  const total = shown.reduce((sum, slice) => sum + -slice.amount, 0) || 1;
  const limitByName = new Map((limits || []).map((row) => [row.category, row]));
  return (
    <div className={compact ? "cat-chart compact" : "cat-chart"}>
      <div className="cat-cols">
        {shown.map((slice) => {
          const limit = limitByName.get(slice.category);
          return (
          <button
            type="button"
            key={slice.category}
            className={picked.includes(slice.category) ? "cat-col selected" : "cat-col"}
            onClick={(event) => onSelect?.(slice.category, event.ctrlKey || event.metaKey)}
            title={`${slice.category}: ${money(slice.amount)} (${percent(Math.abs(Math.min(slice.amount, 0)), total)})`}
          >
            <span className={slice.amount >= 0 ? "cat-col-amount pos" : "cat-col-amount neg"}>
              {money(slice.amount)}
            </span>
            <div
              className="cat-col-bar"
              style={{
                height: `${Math.max(4, (Math.min(Math.abs(slice.amount), spendMax) / spendMax) * (compact ? 140 : 180))}px`,
                background: slice.amount >= 0 ? "var(--income)" : categoryColor(slice.category),
              }}
            />
            <span className="cat-col-label">{slice.category}</span>
            <span className="cat-col-pct">{percent(Math.abs(Math.min(slice.amount, 0)), total)}</span>
            {limit ? (
              <span className={`cat-col-limit ${limit.status}`}>
                {percent(limit.ratio, 1)} limitu
              </span>
            ) : null}
          </button>
          );
        })}
      </div>
      {!compact && (
        <ul className="cat-values">
          {shown.map((slice) => (
            <li key={slice.category}>
              <span style={{ background: categoryColor(slice.category) }} />
              <strong>{slice.category}</strong>
              <em>
                {percent(Math.abs(Math.min(slice.amount, 0)), total)} · {money(slice.amount)}
              </em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Donut({
  slices,
  selected,
  onSelect,
}: {
  slices: { category: string; amount: number }[];
  selected?: string | string[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selectedSet(selected);
  const pie = slices
    .map((slice) => ({ ...slice, spend: Math.abs(Math.min(slice.amount, 0)) }))
    .filter((slice) => slice.spend > 0);
  const total = pie.reduce((sum, slice) => sum + slice.spend, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const selectedSpend = picked.length
    ? pie.filter((slice) => picked.includes(slice.category)).reduce((sum, slice) => sum + slice.spend, 0)
    : total;
  const selectedLabel =
    picked.length === 1 ? picked[0] : picked.length > 1 ? `${picked.length} kategorie` : "Wydatki";

  return (
    <div className="donut-wrap">
      <div className="donut-frame">
        <svg viewBox="0 0 120 120" className="donut">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#ece6d8" strokeWidth="14" />
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
                strokeLinecap="butt"
                opacity={dimmed ? 0.25 : 1}
                transform="rotate(-90 60 60)"
                style={{ cursor: onSelect ? "pointer" : undefined }}
                onClick={(event) => onSelect?.(slice.category, event.ctrlKey || event.metaKey)}
              />
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
              onClick={(event) => onSelect?.(slice.category, event.ctrlKey || event.metaKey)}
            >
              <span style={{ background: categoryColor(slice.category) }} />
              <strong>{slice.category}</strong>
              <em>{money(slice.amount)}</em>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({
  months,
}: {
  months: { month: string; income: number; expenses: number }[];
}) {
  const max = Math.max(1, ...months.flatMap((row) => [row.income, row.expenses]));
  return (
    <div className="bars">
      {months.map((row) => (
        <div key={row.month} className="bar-col">
          <div className="bar-tracks">
            <div className="bar income" style={{ height: `${(row.income / max) * 100}%` }} />
            <div className="bar expense" style={{ height: `${(row.expenses / max) * 100}%` }} />
          </div>
          <span>{row.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function WeekdayBars({ days }: { days: { id: number; amount: number }[] }) {
  const max = Math.max(1, ...days.map((day) => day.amount));
  const total = days.reduce((sum, day) => sum + day.amount, 0) || 1;
  const peak = days.reduce((best, day) => (day.amount > best.amount ? day : best), days[0]);
  return (
    <div className="weekday-chart">
      <div className="weekday-cols">
        {days.map((day, index) => (
          <div key={day.id} className={peak?.id === day.id ? "weekday-col peak" : "weekday-col"}>
            <span className="cat-col-amount">{compactMoney(day.amount)}</span>
            <div
              className="weekday-bar"
              style={{ height: `${Math.max(4, (day.amount / max) * 120)}px` }}
            />
            <span className="cat-col-label">{WEEKDAY_LABELS[index]}</span>
            <span className="cat-col-pct">{percent(day.amount, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AmountColumns({
  slices,
  selected,
  onSelect,
}: {
  slices: { id: string; label: string; amount: number; count: number }[];
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(1, ...slices.map((slice) => slice.amount));
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0) || 1;
  const colors = ["#1b2a4a", "#3d6ea8", "#c47a12", "#8a8175"];
  return (
    <div className="cat-chart compact">
      <div className="cat-cols">
        {slices.map((slice, index) => (
          <button
            type="button"
            key={slice.id}
            className={selected === slice.id ? "cat-col selected" : "cat-col"}
            onClick={() => onSelect?.(slice.id)}
            title={`${slice.label}: ${money(slice.amount)} · ${slice.count} płatności`}
          >
            <span className="cat-col-amount">{money(slice.amount)}</span>
            <div
              className="cat-col-bar"
              style={{
                height: `${Math.max(4, (slice.amount / max) * 140)}px`,
                background: colors[index % colors.length],
              }}
            />
            <span className="cat-col-label">{slice.label}</span>
            <span className="cat-col-pct">
              {slice.count} szt. · {percent(slice.amount, total)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function TrendLines({
  months,
  series,
  hidden,
  onLegend,
  yMax,
}: {
  months: string[];
  series: { category: string; values: number[] }[];
  hidden: Set<string>;
  onLegend: (category: string) => void;
  yMax?: number;
}) {
  const [hover, setHover] = useState<{ index: number; category: string } | null>(null);
  const visible = series.filter((row) => !hidden.has(row.category));
  const dataMax = Math.max(1, ...visible.flatMap((row) => row.values));
  const max = Math.max(1, yMax && yMax > 0 ? yMax : dataMax);
  const width = 640;
  const height = 280;
  const pad = { left: 64, right: 16, top: 16, bottom: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (months.length <= 1 ? innerW / 2 : (index / (months.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (Math.min(Math.max(value, 0), max) / max) * innerH;

  function moveHover(event: MouseEvent<SVGSVGElement>) {
    if (!visible.length || !months.length) return;
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    let index = 0;
    let bestX = Infinity;
    months.forEach((_, i) => {
      const dx = Math.abs(x(i) - local.x);
      if (dx < bestX) {
        bestX = dx;
        index = i;
      }
    });
    let category = visible[0].category;
    let bestY = Infinity;
    for (const row of visible) {
      const dy = Math.abs(y(row.values[index] || 0) - local.y);
      if (dy < bestY) {
        bestY = dy;
        category = row.category;
      }
    }
    setHover({ index, category });
  }

  const hovered = hover && visible.find((row) => row.category === hover.category);
  const tooltipLeft = hover ? Math.min(86, Math.max(8, (x(hover.index) / width) * 100)) : 0;

  return (
    <div className="trend-chart">
      <div className="trend-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="trend-svg"
          role="img"
          onMouseMove={moveHover}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((part) => {
            const value = max * (1 - part);
            const py = pad.top + innerH * part;
            return (
              <g key={part}>
                <line x1={pad.left} x2={width - pad.right} y1={py} y2={py} stroke="#eee6d8" />
                <text x={pad.left - 8} y={py + 4} textAnchor="end" className="trend-axis">
                  {compactMoney(value)}
                </text>
              </g>
            );
          })}
          {hover ? (
            <line
              x1={x(hover.index)}
              x2={x(hover.index)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="#cbb89a"
              strokeDasharray="3 3"
            />
          ) : null}
          {visible.map((row) => {
            const points = row.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
            const active = hover?.category === row.category;
            return (
              <polyline
                key={row.category}
                fill="none"
                stroke={categoryColor(row.category)}
                strokeWidth={active ? "2.1" : "1.25"}
                opacity={hover && !active ? 0.35 : 1}
                points={points}
              />
            );
          })}
          {hover && hovered ? (
            <circle
              cx={x(hover.index)}
              cy={y(hovered.values[hover.index] || 0)}
              r="4"
              fill={categoryColor(hovered.category)}
              stroke="#fff"
              strokeWidth="1.5"
            />
          ) : null}
          {months.map((month, index) => (
            <text key={month} x={x(index)} y={height - 10} textAnchor="middle" className="trend-axis">
              {shortMonthTick(month)}
            </text>
          ))}
        </svg>
        {hover && hovered ? (
          <div className="trend-tooltip" style={{ left: `${tooltipLeft}%` }}>
            <p className="trend-tooltip-month">{monthLabel(months[hover.index])}</p>
            <p className="trend-tooltip-main">
              <span style={{ background: categoryColor(hovered.category) }} />
              <strong>{hovered.category}</strong>
              <em>{money(hovered.values[hover.index] || 0)}</em>
            </p>
            <ul>
              {visible
                .filter((row) => row.category !== hovered.category)
                .sort((a, b) => (b.values[hover.index] || 0) - (a.values[hover.index] || 0))
                .slice(0, 6)
                .map((row) => (
                  <li key={row.category}>
                    <span style={{ background: categoryColor(row.category) }} />
                    {row.category}
                    <em>{money(row.values[hover.index] || 0)}</em>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
      <ul className="legend trend-legend">
        {series.map((row) => {
          const isolated = hidden.size > 0 && !hidden.has(row.category);
          const off = hidden.has(row.category);
          return (
            <li key={row.category}>
              <button
                type="button"
                className={`legend-btn ${off ? "off" : ""} ${isolated && hidden.size ? "active" : ""}`}
                onClick={() => onLegend(row.category)}
              >
                <span style={{ background: categoryColor(row.category) }} />
                {row.category}
              </button>
            </li>
          );
        })}
      </ul>
      {months[0] && months[months.length - 1] ? (
        <p className="muted chart-hint">
          {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}. Najedź na linię, żeby zobaczyć kategorię.
          Kliknij legendę, żeby zostawić tylko ją.
        </p>
      ) : null}
    </div>
  );
}
