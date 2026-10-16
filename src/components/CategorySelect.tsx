import { useState } from "react";
import { DEFAULT_CATEGORY } from "../modules/shared/domain.ts";
import { categoryColor } from "../colors";
import { Modal } from "./Modal";
import { NewCategoryDialog } from "./NewCategoryDialog";

export type CategoryScope = "one" | "merchant";

export type CategoryChangeOptions = { force?: boolean };

function MerchantDialog({
  open,
  merchant,
  value,
  categories,
  onClose,
  onApply,
}: {
  open: boolean;
  merchant: string;
  value: string;
  categories: string[];
  onClose: () => void;
  onApply: (category: string, options: CategoryChangeOptions) => void;
}) {
  const [category, setCategory] = useState(value);
  const [force, setForce] = useState(false);
  return (
    <Modal
      open={open}
      title="Kategoria dla wszystkich płatności od odbiorcy"
      eyebrow={merchant ? `Odbiorca: ${merchant}` : "Odbiorca"}
      onClose={onClose}
      onSubmit={() => {
        onApply(category, { force });
        onClose();
      }}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="primary">
            Zmień wszystkie
          </button>
        </>
      }
    >
      <label className="field">
        Kategoria
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {categories.map((cat) => (
            <option key={cat}>{cat}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
        <span>
          Nadpisz też ręcznie ustawione
          <small>
            Płatności, którym sam zmieniłeś kategorię, zostają jako wyjątki. Zaznacz, żeby je też przestawić.
          </small>
        </span>
      </label>
      <p className="field-hint">
        Powstanie reguła dla „{merchant || "tego odbiorcy"}” — przyszłe importy też tu trafią. Regułę usuniesz w
        Kategorie. Żeby zmienić tylko tę jedną płatność, wybierz kategorię z listy obok.
      </p>
    </Modal>
  );
}

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
  onChange: (category: string, scope: CategoryScope, options?: CategoryChangeOptions) => void;
  compact?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const merchant = who.trim();

  function pick(next: string) {
    if (!next || next === value) return;
    onChange(next, "one");
  }

  return (
    <div className={compact ? "cat-edit compact" : "cat-edit"}>
      <select
        className={`cat${compact ? " compact" : ""}${value === DEFAULT_CATEGORY ? " uncat" : ""}`}
        style={{ borderColor: categoryColor(value) }}
        value={value}
        aria-label="Kategoria tej płatności"
        title="Zmienia kategorię tylko tej płatności"
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__new") {
            setCreating(true);
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
      {merchant ? (
        <button
          type="button"
          className="cat-merchant"
          title={`Ustaw jedną kategorię dla wszystkich płatności od „${merchant}” (także przyszłych)`}
          onClick={() => setApplyAll(true)}
        >
          {compact ? "wszystkie od odbiorcy…" : "Wszystkie od odbiorcy…"}
        </button>
      ) : null}
      <NewCategoryDialog
        open={creating}
        categories={categories}
        who={merchant}
        onClose={() => setCreating(false)}
        onCreate={(name, scope) => onChange(name, scope)}
      />
      {applyAll ? (
        <MerchantDialog
          open
          merchant={merchant}
          value={value}
          categories={categories}
          onClose={() => setApplyAll(false)}
          onApply={(category, options) => onChange(category, "merchant", options)}
        />
      ) : null}
    </div>
  );
}
