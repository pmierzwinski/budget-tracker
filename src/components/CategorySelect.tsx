import { categoryColor } from "../format";

const OTHER = "Inne";

export type CategoryScope = "one" | "merchant";

export function CategorySelect({
  value,
  categories,
  who,
  onChange,
  compact,
}: {
  value: string;
  categories: string[];
  who: string;
  onChange: (category: string, scope: CategoryScope) => void;
  compact?: boolean;
}) {
  const merchant = who.trim();

  function pick(next: string) {
    if (!next || next === value) return;
    onChange(next, "one");
  }

  return (
    <div className={compact ? "cat-edit compact" : "cat-edit"}>
      <select
        className={`cat${compact ? " compact" : ""}${value === OTHER ? " uncat" : ""}`}
        style={{ borderColor: categoryColor(value) }}
        value={value}
        aria-label="Kategoria płatności"
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__new") {
            const name = window.prompt("Nazwa nowej kategorii");
            if (name?.trim()) pick(name.trim());
            return;
          }
          pick(next);
        }}
      >
        {categories.map((cat) => (
          <option key={cat}>{cat}</option>
        ))}
        <option value="__new">+ nowa kategoria…</option>
      </select>
      <button
        type="button"
        className="cat-merchant"
        title={
          merchant
            ? `Ustaw „${value}” dla wszystkich płatności od „${merchant}”`
            : "Ustaw tę kategorię dla wszystkich płatności od tego pośrednika"
        }
        onClick={() => onChange(value, "merchant")}
      >
        {compact ? "wszystkie" : "Dla pośrednika"}
      </button>
    </div>
  );
}
