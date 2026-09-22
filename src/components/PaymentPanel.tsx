import { CategorySelect, type CategoryScope } from "./CategorySelect";
import { CommentNote } from "./CommentNote";
import { categoryColor, money, shortDate } from "../format";
import type { Transaction } from "../types";

export type PaySort =
  | "amount_desc"
  | "amount_asc"
  | "category_asc"
  | "category_desc"
  | "date_desc"
  | "date_asc";

export function PaymentPanel({
  items,
  sort,
  onSort,
  categories,
  categoryFilter,
  onClearFilter,
  onRemoveCategory,
  amountFilter,
  onClearAmount,
  onCategoryChange,
  onCommentChange,
}: {
  items: Transaction[];
  sort: PaySort;
  onSort: (sort: PaySort) => void;
  categories: string[];
  categoryFilter?: string[];
  onClearFilter?: () => void;
  onRemoveCategory?: (category: string) => void;
  amountFilter?: string;
  onClearAmount?: () => void;
  onCategoryChange: (item: Transaction, category: string, scope: CategoryScope) => void;
  onCommentChange: (item: Transaction, comment: string) => void;
}) {
  return (
    <aside className="pay-panel">
      <div className="pay-panel-head">
        <div>
          <p className="eyebrow">Ten okres</p>
          <h2>Płatności</h2>
        </div>
        <p className="muted">{items.length} pozycji</p>
        <div className="pay-sort" role="group" aria-label="Sortowanie">
          <button
            type="button"
            className={sort.startsWith("amount") ? "active" : undefined}
            onClick={() => onSort(sort === "amount_desc" ? "amount_asc" : "amount_desc")}
          >
            {sort === "amount_asc" ? "Kwota ↑" : "Kwota ↓"}
          </button>
          <button
            type="button"
            className={sort.startsWith("category") ? "active" : undefined}
            onClick={() => onSort(sort === "category_asc" ? "category_desc" : "category_asc")}
          >
            {sort === "category_desc" ? "Kategoria ↓" : sort === "category_asc" ? "Kategoria ↑" : "Kategoria"}
          </button>
          <button
            type="button"
            className={sort.startsWith("date") ? "active" : undefined}
            onClick={() => onSort(sort === "date_desc" ? "date_asc" : "date_desc")}
          >
            {sort === "date_asc" ? "Data ↑" : "Data ↓"}
          </button>
        </div>
        {categoryFilter?.length ? (
          <div className="filter-chips">
            {categoryFilter.map((name) => (
              <button
                type="button"
                key={name}
                className="filter-chip"
                onClick={() => onRemoveCategory?.(name)}
              >
                {name} ×
              </button>
            ))}
            {categoryFilter.length > 1 ? (
              <button type="button" className="filter-chip" onClick={onClearFilter}>
                Wyczyść ×
              </button>
            ) : null}
          </div>
        ) : null}
        {amountFilter ? (
          <button type="button" className="filter-chip" onClick={onClearAmount}>
            {amountFilter} ×
          </button>
        ) : null}
      </div>
      <div className="pay-rows">
        {items.map((item) => {
          const color = categoryColor(item.category);
          return (
            <article key={item.id} className={item.category === "Inne" ? "pay-row uncat" : "pay-row"}>
              <span className="pay-row-mark" style={{ background: color }} />
              <div>
                <strong className="who">{item.payee || item.type || "Operacja"}</strong>
                <p className="pay-meta">
                  <span>{shortDate(item.date)}</span>
                  <CategorySelect
                    compact
                    value={item.category}
                    categories={categories}
                    who={item.payee || item.title || item.type || ""}
                    onChange={(next, scope) => onCategoryChange(item, next, scope)}
                  />
                  {item.title ? <span className="pay-title">{item.title}</span> : null}
                  <CommentNote
                    compact
                    value={item.comment || ""}
                    onSave={(next) => onCommentChange(item, next)}
                  />
                </p>
              </div>
              <strong className={item.amount < 0 ? "num neg" : "num pos"}>{money(item.amount)}</strong>
            </article>
          );
        })}
        {!items.length && <p className="muted pay-empty">Brak płatności w tym widoku.</p>}
      </div>
    </aside>
  );
}
