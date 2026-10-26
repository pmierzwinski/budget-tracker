import { DEFAULT_CATEGORY } from "../../../shared/domain";
import type { TxKind } from "../../../shared/types";
import { Icon } from "../../ui/Icon";
import { Segmented } from "../../ui/Segmented";

export const ALL = "Wszystkie";

export type PaymentFilters = { q: string; kind: TxKind; category: string; minAmount: string; maxAmount: string; excludedOnly: boolean };

export const NO_FILTERS: PaymentFilters = { q: "", kind: "all", category: ALL, minAmount: "", maxAmount: "", excludedOnly: false };

export function isFiltered(filters: PaymentFilters): boolean {
  return JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
}

const KINDS: { id: TxKind; label: string }[] = [
  { id: "all", label: "Wszystkie" },
  { id: "expense", label: "Wydatki" },
  { id: "income", label: "Przychody" },
];

/** Search, kind, category, amount range, "Nieskategoryzowane" / "Ukryte" chips, AI button and the result count. */
export function FilterBar({
  filters,
  onChange,
  categories,
  counts,
  matched,
  ai,
}: {
  filters: PaymentFilters;
  onChange: (patch: Partial<PaymentFilters>) => void;
  categories: string[];
  counts: { uncategorized: number; excluded: number };
  matched: number;
  ai: { hasKey: boolean; busy: boolean; run: () => void };
}) {
  const { q, kind, category, minAmount, maxAmount, excludedOnly } = filters;
  const uncategorizedOnly = category === DEFAULT_CATEGORY;
  return (
    <div className="card filter-bar">
      <label className="search-field">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Szukaj płatności"
          placeholder="Szukaj: koleo, orlen, zmywarka…"
          value={q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </label>
      <Segmented options={KINDS} value={kind} onChange={(next) => onChange({ kind: next })} label="Rodzaj operacji" />
      <select aria-label="Kategoria" value={category} onChange={(e) => onChange({ category: e.target.value })}>
        <option value={ALL}>Wszystkie kategorie</option>
        {categories.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      <div className="amount-range">
        <input inputMode="decimal" aria-label="Kwota od" placeholder="od zł" value={minAmount} onChange={(e) => onChange({ minAmount: e.target.value })} />
        <span aria-hidden>–</span>
        <input inputMode="decimal" aria-label="Kwota do" placeholder="do zł" value={maxAmount} onChange={(e) => onChange({ maxAmount: e.target.value })} />
      </div>
      <button
        type="button"
        className={uncategorizedOnly ? "toggle-chip active" : "toggle-chip"}
        aria-pressed={uncategorizedOnly}
        title="Płatności bez kategorii (Inne)"
        onClick={() => onChange({ category: uncategorizedOnly ? ALL : DEFAULT_CATEGORY })}
      >
        Nieskategoryzowane <span className="count">{counts.uncategorized}</span>
      </button>
      {counts.excluded || excludedOnly ? (
        <button
          type="button"
          className={excludedOnly ? "toggle-chip active" : "toggle-chip"}
          aria-pressed={excludedOnly}
          title="Płatności ukryte w statystykach"
          onClick={() => onChange({ excludedOnly: !excludedOnly })}
        >
          <Icon name="eyeOff" size={14} />
          Ukryte <span className="count">{counts.excluded}</span>
        </button>
      ) : null}
      {counts.uncategorized && ai.hasKey ? (
        <button type="button" className="primary" disabled={ai.busy} onClick={ai.run}>
          <Icon name="sparkle" size={16} />
          {ai.busy ? "AI kategoryzuje…" : "Skategoryzuj przez AI"}
        </button>
      ) : null}
      <span className="result-count">
        {matched} {matched === 1 ? "operacja" : "operacji"}
        {isFiltered(filters) ? (
          <button type="button" className="link-btn quiet" onClick={() => onChange(NO_FILTERS)}>
            Wyczyść filtry
          </button>
        ) : null}
      </span>
    </div>
  );
}
