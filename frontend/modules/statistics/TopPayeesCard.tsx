import { CategoryTag } from "../categories";
import { money } from "../../lib/format";
import type { Insights } from "../../../shared/types";

export function TopPayeesCard({ payees }: { payees: Insights["payees"] }) {
  return (
    <article className="card grow">
      <div className="card-head">
        <div>
          <h2>Gdzie idzie najwięcej</h2>
          <p className="card-sub">Odbiorcy z największą sumą wydatków w okresie</p>
        </div>
      </div>
      <div className="table-wrap flat">
        <table className="compact-table">
          <thead>
            <tr>
              <th>Odbiorca</th>
              <th className="num">Płatności</th>
              <th className="num">Średnio</th>
              <th className="num">Razem</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((row) => (
              <tr key={row.name}>
                <td className="cell-name">
                  <CategoryTag category={row.category} title={`${row.name} · ${row.category}`}>
                    <span>{row.name}</span>
                  </CategoryTag>
                </td>
                <td className="num">{row.count}</td>
                <td className="num muted">{money(row.average)}</td>
                <td className="num strong">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
