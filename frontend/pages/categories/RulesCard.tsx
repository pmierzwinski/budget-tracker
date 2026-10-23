import { useState } from "react";
import type { CategoryRule } from "../../../shared/types";
import { CategoryTag } from "../../modules/categories";
import { Icon } from "../../ui/Icon";

/** Phrase rules: add (phrase → category) and remove. */
export function RulesCard({
  rules,
  categories,
  category,
  busy,
  onCategory,
  onAdd,
  onRemove,
}: {
  rules: CategoryRule[];
  categories: string[];
  /** Category picked for a new rule (the page moves it to a just created or renamed category). */
  category: string;
  busy: boolean;
  onCategory: (name: string) => void;
  /** Resolves true when the rule was saved (the phrase field is cleared then). */
  onAdd: (pattern: string, category: string) => Promise<boolean>;
  onRemove: (rule: CategoryRule) => void;
}) {
  const [pattern, setPattern] = useState("");

  async function add() {
    if (await onAdd(pattern, category)) setPattern("");
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Reguły po frazie</h2>
          <p className="card-sub">Fraza w opisie → kategoria. Działa też przy imporcie.</p>
        </div>
      </div>
      <form
        className="rule-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pattern.trim()) void add();
        }}
      >
        <input aria-label="Fraza w opisie" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="np. koleo" />
        <select aria-label="Kategoria dla reguły" value={category} onChange={(e) => onCategory(e.target.value)}>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="primary" type="submit" disabled={!pattern.trim() || busy}>
          Dodaj
        </button>
      </form>
      {rules.length ? (
        <ul className="rules-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span>
                <strong>{rule.pattern}</strong>
                <span className="muted"> → </span>
                <CategoryTag category={rule.category} />
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Usuń regułę ${rule.pattern}`}
                title="Usuń regułę"
                disabled={busy}
                onClick={() => onRemove(rule)}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted empty-note">Nie ma jeszcze własnych reguł — powstają też przy kategoryzacji płatności.</p>
      )}
    </article>
  );
}
