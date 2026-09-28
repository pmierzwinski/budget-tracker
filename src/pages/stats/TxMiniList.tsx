import type { ReactNode } from "react";
import { ExcludeToggle } from "../../components/ExcludeToggle";
import { money, shortDate, txName } from "../../format";
import type { Transaction } from "../../types";

/** Compact payment list (`.drill-list`): date, name + detail line, hide toggle, amount. */
export function TxMiniList({
  items,
  detail,
  fadeExcluded,
  onExcluded,
}: {
  items: Transaction[];
  detail: (item: Transaction) => ReactNode;
  fadeExcluded?: boolean;
  onExcluded: (item: Transaction, excluded: boolean) => void;
}) {
  return (
    <ul className="drill-list">
      {items.map((item) => (
        <li key={item.id} className={item.excluded && fadeExcluded ? "excluded" : undefined}>
          <span className="drill-date">{shortDate(item.date)}</span>
          <span className="drill-who">
            <strong title={item.payee || undefined}>{txName(item)}</strong>
            {detail(item)}
          </span>
          <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => onExcluded(item, next)} />
          <strong className={item.amount < 0 ? "num neg" : "num pos"}>{money(item.amount)}</strong>
        </li>
      ))}
    </ul>
  );
}
