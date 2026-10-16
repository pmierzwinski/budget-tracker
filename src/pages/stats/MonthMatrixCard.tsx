import { useMemo } from "react";
import { categoryColor } from "../../colors";
import { MONTHS_SHORT, money, percent } from "../../format";
import type { Stats } from "../../types";

function columnLabel(month: string): string {
  return `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Category × month amounts with the change to the previous month (only when the period has ≥2 months). */
export function MonthMatrixCard({
  rows,
  categories,
  onIsolate,
}: {
  rows: Stats["byMonthCategory"];
  categories: string[];
  onIsolate: (category: string) => void;
}) {
  const months = useMemo(() => {
    const list = [...new Set(rows.map((row) => row.month))].sort();
    const lookup = new Map(rows.map((row) => [`${row.month}|${row.category}`, row.amount]));
    return {
      list,
      series: categories.map((category) => ({
        category,
        values: list.map((month) => lookup.get(`${month}|${category}`) || 0),
      })),
    };
  }, [rows, categories]);

  if (months.list.length < 2) return null;
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Kwoty i zmiana do poprzedniego miesiąca</h2>
          <p className="card-sub">Czerwony procent — wydatki wzrosły, zielony — spadły</p>
        </div>
      </div>
      <div className="table-wrap flat">
        <table className="matrix">
          <thead>
            <tr>
              <th className="sticky-col">Kategoria</th>
              {months.list.map((month) => (
                <th key={month} className="num">
                  {columnLabel(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.series.map((row) => (
              <tr key={row.category}>
                <td className="sticky-col">
                  <button type="button" className="legend-btn" onClick={() => onIsolate(row.category)}>
                    <span style={{ background: categoryColor(row.category) }} />
                    {row.category}
                  </button>
                </td>
                {row.values.map((value, index) => {
                  const prev = index > 0 ? row.values[index - 1] : 0;
                  const delta = prev ? (value - prev) / prev : 0;
                  return (
                    <td key={months.list[index]} className="num">
                      <span className="cell-value">{value ? money(value) : "—"}</span>
                      {index > 0 && prev ? (
                        <span className={delta > 0 ? "cell-delta neg" : "cell-delta pos"}>
                          {`${delta > 0 ? "+" : ""}${percent(value - prev, prev)}`}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
