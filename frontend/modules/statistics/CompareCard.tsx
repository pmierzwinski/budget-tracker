import { CategoryTag } from "../categories";
import { money, signedPercent } from "../../lib/format";
import type { Stats } from "../../../shared/types";

function spendByCategory(stats: Stats | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of stats?.byCategory || []) if (row.amount < 0) map.set(row.category, -row.amount);
  return map;
}

/** Spend per category now vs the previous comparable period. */
export function CompareCard({ stats, previousStats, label }: { stats: Stats; previousStats: Stats | null; label: string }) {
  const now = spendByCategory(stats);
  const before = spendByCategory(previousStats);
  const rows = [...new Set([...now.keys(), ...before.keys()])]
    .map((category) => ({ category, current: now.get(category) || 0, previous: before.get(category) || 0 }))
    .sort((a, b) => b.current - a.current || b.previous - a.previous);
  return (
    <article className="card compare">
      <div className="card-head">
        <div>
          <h2>Porównanie z poprzednim okresem</h2>
          <p className="card-sub">Ten okres vs {label}</p>
        </div>
      </div>
      {previousStats ? (
        <div className="table-wrap flat">
          <table className="compact-table">
            <thead>
              <tr>
                <th>Kategoria</th>
                <th className="num">Teraz</th>
                <th className="num">Wcześniej</th>
                <th className="num">Zmiana</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const diff = row.current - row.previous;
                return (
                  <tr key={row.category}>
                    <td>
                      <CategoryTag category={row.category} />
                    </td>
                    <td className="num">{row.current ? money(row.current) : "—"}</td>
                    <td className="num muted">{row.previous ? money(row.previous) : "—"}</td>
                    <td className={`num strong ${diff > 0.5 ? "neg" : diff < -0.5 ? "pos" : "muted"}`}>
                      {row.previous ? signedPercent(diff, row.previous) : row.current ? "nowa" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Razem</td>
                <td className="num">{money(stats.expenses)}</td>
                <td className="num">{money(previousStats.expenses)}</td>
                <td className={stats.expenses > previousStats.expenses ? "num neg" : "num pos"}>
                  {previousStats.expenses
                    ? signedPercent(stats.expenses - previousStats.expenses, previousStats.expenses)
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="muted">Ładowanie…</p>
      )}
    </article>
  );
}
