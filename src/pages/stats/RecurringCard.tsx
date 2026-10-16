import { compareRecurring } from "../../modules/shared/domain.ts";
import { CategoryTag } from "../../components/ui/CategoryTag";
import { formatDay, money } from "../../format";
import type { RecurringPayment, RecurringStatus } from "../../types";

/** Recurring payments from the whole history, with a status the user can override. */
export function RecurringCard({
  recurring,
  onStatus,
}: {
  recurring: RecurringPayment[];
  onStatus: (key: string, status: RecurringStatus) => void;
}) {
  const rows = [...recurring].sort(compareRecurring);
  const active = rows.filter((row) => row.active);
  const unreviewed = rows.filter((row) => row.status === "auto").length;
  const monthly = active.reduce((sum, row) => sum + row.amount, 0);
  return (
    <article className="card wide">
      <div className="card-head">
        <div>
          <h2>Płatności cykliczne</h2>
          <p className="card-sub">
            Wykryte z całej historii: ten sam odbiorca co miesiąc, podobna kwota. „Aktywna” — ostatnia płatność
            była w ostatnim lub przedostatnim miesiącu danych, starsze są „zakończone”. Na górze nowe, jeszcze
            nieprzejrzane{unreviewed ? ` (${unreviewed})` : ""}; ustawione ręcznie idą niżej, „to nie
            cykliczna” na sam dół.
          </p>
        </div>
        {active.length ? (
          <span className="pill" title="Suma zwykłych kwot aktywnych płatności cyklicznych">
            ≈ {money(monthly)} / mies.
          </span>
        ) : null}
      </div>
      {recurring.length ? (
        <div className="table-wrap flat">
          <table className="compact-table">
            <thead>
              <tr>
                <th>Odbiorca</th>
                <th>Kategoria</th>
                <th className="num">Zwykle</th>
                <th className="num">Miesięcy</th>
                <th className="num">Ostatnio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.active && row.status !== "hidden" ? undefined : "faded"}>
                  <td className="cell-name">
                    <strong title={row.name}>{row.name}</strong>
                  </td>
                  <td>
                    <CategoryTag category={row.category} />
                  </td>
                  <td className="num strong">{money(row.amount)}</td>
                  <td className="num">{row.months}</td>
                  <td className="num muted">{formatDay(row.lastDate)}</td>
                  <td className="num">
                    <select
                      className={`status-select${row.status === "hidden" ? "" : row.active ? " ok" : " ended"}`}
                      value={row.status}
                      aria-label={`Status płatności cyklicznej ${row.name}`}
                      title={row.status === "auto" ? "Status wyliczony z daty ostatniej płatności" : "Status ustawiony ręcznie"}
                      onChange={(event) => onStatus(row.key, event.target.value as RecurringStatus)}
                    >
                      <option value="auto">{row.autoActive ? "aktywna" : "zakończona"} (auto)</option>
                      <option value="active">aktywna</option>
                      <option value="ended">zakończona</option>
                      <option value="hidden">to nie cykliczna</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Nie widać regularnych płatności — potrzeba co najmniej 3 miesięcy historii.</p>
      )}
    </article>
  );
}
