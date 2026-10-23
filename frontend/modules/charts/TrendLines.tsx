import { useId, useState, type MouseEvent } from "react";
import { categoryColor } from "../categories";
import { compactMoney, money } from "../../lib/format";
import { useWidth } from "./useWidth";

type TrendPoint = { key: string; label: string; tick: string };

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
