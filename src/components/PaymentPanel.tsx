import { CategorySelect, type CategoryScope } from "./CategorySelect";
import { CommentNote } from "./CommentNote";
import { ExcludeToggle } from "./ExcludeToggle";
import { Icon } from "./Icon";
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
  weekdayFilter,
  onClearWeekday,
  onCategoryChange,
  onCommentChange,
  onExcludedChange,
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
  weekdayFilter?: string;
  onClearWeekday?: () => void;
  onCategoryChange: (item: Transaction, category: string, scope: CategoryScope) => void;
  onCommentChange: (item: Transaction, comment: string) => void;
  onExcludedChange?: (item: Transaction, excluded: boolean) => void;
}) {
  return (
    <aside className="pay-panel">
      <div className="pay-panel-head">
        <div className="pay-head-row">
          <h2>
            Płatności <span className="count">{items.length}</span>
          </h2>
          <div className="segmented sm" role="group" aria-label="Sortowanie">
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
        </div>
        {categoryFilter?.length || amountFilter || weekdayFilter ? (
          <div className="filter-chips">
            {categoryFilter?.map((name) => (
              <button
                type="button"
                key={name}
                className="filter-chip"
                title="Usuń filtr"
                onClick={() => onRemoveCategory?.(name)}
              >
                <span className="dot" style={{ background: categoryColor(name) }} />
                {name}
                <Icon name="close" size={13} />
              </button>
            ))}
            {amountFilter ? (
              <button type="button" className="filter-chip" title="Usuń filtr" onClick={onClearAmount}>
                {amountFilter}
                <Icon name="close" size={13} />
              </button>
            ) : null}
            {weekdayFilter ? (
              <button type="button" className="filter-chip" title="Usuń filtr" onClick={onClearWeekday}>
                {weekdayFilter}
                <Icon name="close" size={13} />
              </button>
            ) : null}
            {(categoryFilter?.length || 0) > 1 ? (
              <button type="button" className="link-btn quiet" onClick={onClearFilter}>
                Wyczyść
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="pay-rows">
        {items.map((item) => {
          const color = categoryColor(item.category);
          return (
            <article
              key={item.id}
              className={`pay-row${item.category === "Inne" ? " uncat" : ""}${item.excluded ? " excluded" : ""}`}
            >
              <span className="pay-row-mark" style={{ background: color }} />
              <div className="pay-body">
                <strong className="who" title={item.payee || item.type || undefined}>
                  {item.payee || item.type || "Operacja"}
                </strong>
                <div className="pay-meta">
                  <span className="pay-date">{shortDate(item.date)}</span>
                  <CategorySelect
                    compact
                    value={item.category}
                    categories={categories}
                    who={item.payee || item.title || item.type || ""}
                    onChange={(next, scope) => onCategoryChange(item, next, scope)}
                  />
                  {item.title ? (
                    <span className="pay-title" title={item.title}>
                      {item.title}
                    </span>
                  ) : null}
                  <CommentNote
                    compact
                    value={item.comment || ""}
                    onSave={(next) => onCommentChange(item, next)}
                  />
                  {onExcludedChange ? (
                    <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => onExcludedChange(item, next)} />
                  ) : null}
                </div>
              </div>
              <strong className={item.amount < 0 ? "pay-amount neg" : "pay-amount pos"}>{money(item.amount)}</strong>
            </article>
          );
        })}
        {!items.length && <p className="muted pay-empty">Brak płatności w tym widoku.</p>}
      </div>
    </aside>
  );
}
