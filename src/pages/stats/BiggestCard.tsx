import { Swatch } from "../../components/ui/CategoryTag";
import type { Transaction } from "../../types";
import { TxMiniList } from "./TxMiniList";

/** Largest expenses of the period — one-off big ones can be hidden right here. */
export function BiggestCard({
  items,
  onExcluded,
}: {
  items: Transaction[];
  onExcluded: (item: Transaction, excluded: boolean) => void;
}) {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Największe wydatki</h2>
          <p className="card-sub">Jednorazowo duże kwoty możesz od razu ukryć w statystykach</p>
        </div>
      </div>
      <TxMiniList
        items={items}
        detail={(item) => (
          <em>
            <Swatch category={item.category} /> {item.category}
            {item.comment ? ` · ${item.comment}` : ""}
          </em>
        )}
        onExcluded={onExcluded}
      />
    </article>
  );
}
