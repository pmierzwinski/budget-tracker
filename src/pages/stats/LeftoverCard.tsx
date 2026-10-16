import { money, monthLabel } from "../../format";
import type { Stats } from "../../types";

/** "Ile zostaje": income minus expenses per month — hidden payments count here too. */
export function LeftoverCard({ months }: { months: Stats["byMonth"] }) {
  const leftover = months.map((row) => ({ ...row, net: row.income - row.expenses }));
  if (!leftover.length) return null;
  const sum = leftover.reduce((total, row) => total + row.net, 0);
  const last = leftover[leftover.length - 1];
  const average = sum / leftover.length;
  const tone = (value: number) => (value >= 0 ? "pos" : "neg");
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Ile zostaje</h2>
          <p className="card-sub">Przychody minus wydatki — tu liczą się też płatności ukryte w statystykach</p>
        </div>
      </div>
      <div className="leftover">
        <dl className="stat-list">
          <div>
            <dt>Suma w okresie</dt>
            <dd className={tone(sum)}>{money(sum)}</dd>
          </div>
          {leftover.length > 1 ? (
            <>
              <div>
                <dt>Średnio na miesiąc</dt>
                <dd className={tone(average)}>{money(average)}</dd>
              </div>
              <div>
                <dt>Ostatni miesiąc{last ? ` · ${monthLabel(last.month)}` : ""}</dt>
                <dd className={tone(last?.net || 0)}>{last ? money(last.net) : "—"}</dd>
              </div>
            </>
          ) : null}
        </dl>
        <div className="table-wrap flat">
          <table>
            <thead>
              <tr>
                <th>Miesiąc</th>
                <th className="num">Przychody</th>
                <th className="num">Wydatki</th>
                <th className="num">Zostaje</th>
              </tr>
            </thead>
            <tbody>
              {leftover.map((row) => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td className="num">{money(row.income)}</td>
                  <td className="num">{money(row.expenses)}</td>
                  <td className={`num ${tone(row.net)} strong`}>{money(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
