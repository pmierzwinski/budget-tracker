import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import {
  MONTHS_SHORT,
  WEEKDAY_LABELS,
  categoryColor,
  compactMoney,
  money,
  monthLabel,
  percent,
  roundMoney,
} from "../format";
import type { CategoryBudget } from "../types";

const PLOT = 110;

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function CategoryBars({
  slices,
  selected,
  limits,
  onSelect,
}: {
  slices: { category: string; amount: number }[];
  selected?: string[];
  limits?: CategoryBudget[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selected || [];
  const rows = slices
    .filter((slice) => slice.amount < 0)
    .map((slice) => ({ category: slice.category, spend: -slice.amount }));
  const max = Math.max(1, ...rows.map((row) => row.spend));
  const total = rows.reduce((sum, row) => sum + row.spend, 0) || 1;
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
              onClick={(event) => onSelect?.(row.category, event.ctrlKey || event.metaKey)}
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
  slices: { category: string; amount: number }[];
  selected?: string[];
  onSelect?: (category: string, additive: boolean) => void;
}) {
  const picked = selected || [];
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
                onClick={(event) => onSelect?.(slice.category, event.ctrlKey || event.metaKey)}
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
              onClick={(event) => onSelect?.(slice.category, event.ctrlKey || event.metaKey)}
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

export function MonthBars({ months }: { months: { month: string; income: number; expenses: number }[] }) {
  const max = Math.max(1, ...months.flatMap((row) => [row.income, row.expenses]));
  const labelEvery = Math.max(1, Math.ceil(months.length / 12));
  return (
    <div>
      <div className="vcols">
        {months.map((row, index) => (
          <div
            key={row.month}
            className="vcol"
            title={`${monthLabel(row.month)}\nprzychody ${money(row.income)}\nwydatki ${money(row.expenses)}`}
          >
            <span className="vcol-pair">
              <span className="vcol-bar income" style={{ height: `${Math.max(2, (row.income / max) * PLOT)}px` }} />
              <span className="vcol-bar expense" style={{ height: `${Math.max(2, (row.expenses / max) * PLOT)}px` }} />
            </span>
            <span className="vcol-label">
              {(months.length - 1 - index) % labelEvery === 0 ? MONTHS_SHORT[Number(row.month.slice(5, 7)) - 1] : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="chart-key">
        <span className="dot income" />
        przychody
        <span className="dot expense" />
        wydatki
      </p>
    </div>
  );
}

export function WeekdayBars({
  days,
  selected,
  onSelect,
}: {
  days: { id: number; amount: number }[];
  selected?: number | null;
  onSelect?: (id: number) => void;
}) {
  const max = Math.max(1, ...days.map((day) => day.amount));
  const total = days.reduce((sum, day) => sum + day.amount, 0) || 1;
  const peak = days.reduce((best, day) => (day.amount > best.amount ? day : best), days[0]);
  return (
    <ul className="meters">
      {days.map((day, index) => {
        const classes = ["meter"];
        if (peak?.id === day.id && day.amount > 0) classes.push("peak");
        if (selected === day.id) classes.push("selected");
        return (
          <li key={day.id}>
            <button
              type="button"
              className={classes.join(" ")}
              aria-pressed={selected === day.id}
              title={`${WEEKDAY_LABELS[index]}: ${money(day.amount)} (${percent(day.amount, total)})`}
              onClick={() => onSelect?.(day.id)}
            >
              <span className="meter-fill" style={{ width: `${(day.amount / max) * 100}%` }} />
              <span className="meter-label">{WEEKDAY_LABELS[index]}</span>
              <span className="meter-value">{day.amount ? roundMoney(day.amount) : "–"}</span>
              <span className="meter-sub">{percent(day.amount, total)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AmountBars({
  slices,
  selected,
  onSelect,
}: {
  slices: { id: string; label: string; amount: number; count: number }[];
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(1, ...slices.map((slice) => slice.amount));
  return (
    <ul className="meters">
      {slices.map((slice) => (
        <li key={slice.id}>
          <button
            type="button"
            className={selected === slice.id ? "meter selected" : "meter"}
            aria-pressed={selected === slice.id}
            title={`${slice.label}: ${money(slice.amount)} · ${slice.count} płatności`}
            onClick={() => onSelect?.(slice.id)}
          >
            <span className="meter-fill" style={{ width: `${(slice.amount / max) * 100}%` }} />
            <span className="meter-label">{slice.label}</span>
            <span className="meter-value">{slice.amount ? roundMoney(slice.amount) : "–"}</span>
            <span className="meter-sub">{slice.count} szt.</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export type TrendPoint = { key: string; label: string; tick: string };

export function TrendLines({
  points,
  series,
  hidden,
  onLegend,
  yMax,
  selected,
  onPick,
}: {
  points: TrendPoint[];
  series: { category: string; values: number[] }[];
  hidden: Set<string>;
  onLegend: (category: string) => void;
  yMax?: number;
  selected?: { index: number; category: string } | null;
  onPick?: (index: number, category: string) => void;
}) {
  const [hover, setHover] = useState<{ index: number; category: string } | null>(null);
  const [plotRef, width] = useWidth<HTMLDivElement>(720);
  const visible = series.filter((row) => !hidden.has(row.category));
  const dataMax = Math.max(1, ...visible.flatMap((row) => row.values));
  const max = Math.max(1, yMax && yMax > 0 ? yMax : dataMax);
  const height = 320;
  const pad = { left: 58, right: 14, top: 14, bottom: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (Math.max(value, 0) / max) * innerH;
  const clipId = `trend-clip-${useId().replace(/:/g, "")}`;
  const clipped = Boolean(yMax && yMax > 0 && dataMax > yMax);
  const tickEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 64))));
  const showDots = points.length > 1 && innerW / points.length >= 4;

  function locate(event: MouseEvent<SVGSVGElement>): { index: number; category: string } | null {
    if (!visible.length || !points.length) return null;
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = point.matrixTransform(ctm.inverse());
    let index = 0;
    let bestX = Infinity;
    points.forEach((_, i) => {
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
    return { index, category };
  }

  function moveHover(event: MouseEvent<SVGSVGElement>) {
    const next = locate(event);
    if (next) setHover(next);
  }

  const hovered = hover && visible.find((row) => row.category === hover.category);
  const picked = selected && visible.find((row) => row.category === selected.category);
  const tooltipStyle = (() => {
    if (!hover || !hovered) return undefined;
    const onRight = x(hover.index) > pad.left + innerW / 2;
    return onRight
      ? { left: `${pad.left + 6}px`, top: `${pad.top}px` }
      : { right: `${pad.right + 6}px`, top: `${pad.top}px` };
  })();

  return (
    <div className="trend-chart">
      <div className="trend-plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={onPick ? "trend-svg pickable" : "trend-svg"}
          role="img"
          aria-label="Wydatki kategorii w czasie"
          onMouseMove={moveHover}
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const target = locate(event);
            if (target && onPick) onPick(target.index, target.category);
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((part) => {
            const value = max * (1 - part);
            const py = pad.top + innerH * part;
            return (
              <g key={part}>
                <line x1={pad.left} x2={width - pad.right} y1={py} y2={py} stroke="#eceef2" />
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
              stroke="#98a2b3"
              strokeDasharray="3 3"
            />
          ) : null}
          <defs>
            <clipPath id={clipId}>
              <rect x={pad.left - 10} y={pad.top - 5} width={innerW + 20} height={innerH + 10} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
          {visible.map((row) => {
            const line = row.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
            const active = hover?.category === row.category;
            return (
              <polyline
                key={row.category}
                fill="none"
                stroke={categoryColor(row.category)}
                strokeWidth={active ? 2.6 : 1.6}
                strokeLinejoin="round"
                opacity={hover && !active ? 0.3 : 1}
                points={line}
              />
            );
          })}
          {showDots
            ? visible.map((row) => (
                <g key={`dots-${row.category}`} opacity={hover && hover.category !== row.category ? 0.3 : 1}>
                  {row.values.map((value, index) =>
                    value > 0.004 ? (
                      <circle
                        key={points[index].key}
                        cx={x(index)}
                        cy={y(value)}
                        r="2.3"
                        fill={categoryColor(row.category)}
                      />
                    ) : null,
                  )}
                </g>
              ))
            : null}
          {selected && picked ? (
            <circle
              cx={x(selected.index)}
              cy={y(picked.values[selected.index] || 0)}
              r="8"
              fill="none"
              stroke={categoryColor(picked.category)}
              strokeWidth="2"
              className="trend-picked"
            />
          ) : null}
          {hover && hovered ? (
            <circle
              cx={x(hover.index)}
              cy={y(hovered.values[hover.index] || 0)}
              r="4.5"
              fill={categoryColor(hovered.category)}
              stroke="#fff"
              strokeWidth="1.5"
            />
          ) : null}
          </g>
          {clipped ? (
            <line x1={pad.left} x2={width - pad.right} y1={pad.top} y2={pad.top} stroke="#98a2b3" strokeDasharray="5 4" />
          ) : null}
          {points.map((point, index) =>
            (points.length - 1 - index) % tickEvery === 0 ? (
              <text key={point.key} x={x(index)} y={height - 8} textAnchor="middle" className="trend-axis">
                {point.tick}
              </text>
            ) : null,
          )}
        </svg>
        {hover && hovered ? (
          <div className="trend-tooltip" style={tooltipStyle}>
            <p className="trend-tooltip-month">{points[hover.index]?.label}</p>
            <p className="trend-tooltip-main">
              <span style={{ background: categoryColor(hovered.category) }} />
              <strong>{hovered.category}</strong>
              <em>{money(hovered.values[hover.index] || 0)}</em>
            </p>
            <ul>
              {visible
                .filter((row) => row.category !== hovered.category && (row.values[hover.index] || 0) > 0.004)
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
            {onPick ? <p className="trend-tooltip-hint">Kliknij, żeby zobaczyć płatności</p> : null}
          </div>
        ) : null}
      </div>
      <ul className="legend trend-legend">
        {series.map((row) => {
          const off = hidden.has(row.category);
          const isolated = hidden.size > 0 && !off;
          return (
            <li key={row.category}>
              <button
                type="button"
                className={`legend-btn${off ? " off" : ""}${isolated ? " active" : ""}`}
                aria-pressed={isolated}
                onClick={() => onLegend(row.category)}
              >
                <span style={{ background: categoryColor(row.category) }} />
                {row.category}
                <em>{compactMoney(row.values.reduce((sum, value) => sum + value, 0))}</em>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
