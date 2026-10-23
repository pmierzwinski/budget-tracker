import type { ReactNode } from "react";
import { DEFAULT_CATEGORY } from "../../../shared/domain";
import type { Transaction, TxSort } from "../../../shared/types";
import { CategorySelect, type CategoryChangeOptions, type CategoryScope } from "../../modules/categories";
import { CommentNote, ExcludeToggle } from "../../modules/payments";
import { formatDay, money, txName, txWho } from "../../lib/format";

type SortField = "date" | "amount" | "category";

export type RowEdits = {
  changeCategory: (item: Transaction, category: string, scope: CategoryScope, options?: CategoryChangeOptions) => unknown;
  changeComment: (item: Transaction, comment: string) => unknown;
  changeExcluded: (item: Transaction, excluded: boolean) => unknown;
};

/** The payments table: sortable headers, inline category / comment / hide. */
export function PaymentsTable({
  items,
  categories,
  sort,
  onSort,
  edits,
  empty,
}: {
  items: Transaction[];
  categories: string[];
  sort: TxSort;
  onSort: (sort: TxSort) => void;
  edits: RowEdits;
  /** Shown in place of rows when the list is empty. */
  empty: ReactNode;
}) {
  function sortButton(field: SortField, label: string, title?: string) {
    const desc = `${field}_desc` as TxSort;
    const asc = `${field}_asc` as TxSort;
    const first = field === "category" ? asc : desc;
    const active = sort.startsWith(field);
    return (
      <button
        type="button"
        className={active ? "th-sort active" : "th-sort"}
        title={title}
        onClick={() => onSort(sort === first ? (first === asc ? desc : asc) : first)}
      >
        {label}
        {active ? (sort.endsWith("asc") ? " ↑" : " ↓") : ""}
      </button>
    );
  }

  return (
    <div className="table-wrap tx-table">
      <table>
        <thead>
          <tr>
            <th className="col-date">{sortButton("date", "Data")}</th>
            <th>Odbiorca / opis</th>
            <th className="col-cat">
              {sortButton(
                "category",
                "Kategoria",
                "Zmiana na liście dotyczy tylko tej płatności. „Wszystkie od odbiorcy…” ustawia kategorię dla wszystkich płatności od tego odbiorcy, także przyszłych.",
              )}
            </th>
            <th className="num">{sortButton("amount", "Kwota")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <PaymentRow key={item.id} item={item} categories={categories} edits={edits} />
          ))}
          {!items.length && (
            <tr>
              <td colSpan={4} className="muted empty-row">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaymentRow({ item, categories, edits }: { item: Transaction; categories: string[]; edits: RowEdits }) {
  const description = [item.title, item.type].filter(Boolean).join(" · ");
  const className = [item.category === DEFAULT_CATEGORY ? "uncat" : "", item.excluded ? "excluded" : ""].join(" ").trim();
  return (
    <tr className={className || undefined}>
      <td className="tx-date">{formatDay(item.date)}</td>
      <td className="tx-who">
        <strong title={item.payee || undefined}>{txName(item)}</strong>
        <div className="tx-desc">
          {description ? <span title={description}>{description}</span> : null}
          <CommentNote compact value={item.comment || ""} onSave={(next) => void edits.changeComment(item, next)} />
          <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => void edits.changeExcluded(item, next)} />
        </div>
      </td>
      <td>
        <CategorySelect
          value={item.category}
          categories={categories}
          who={txWho(item)}
          onChange={(next, scope, options) => void edits.changeCategory(item, next, scope, options)}
        />
      </td>
      <td className={item.amount < 0 ? "num neg strong" : "num pos strong"}>{money(item.amount)}</td>
    </tr>
  );
}
