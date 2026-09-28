import { useEffect, useState } from "react";
import { api } from "../../api";
import { Icon } from "../../components/Icon";
import type { Navigate } from "../../components/Layout";
import { NewCategoryDialog } from "../../components/NewCategoryDialog";
import { categoryColor } from "../../format";
import type { CategoryRule } from "../../types";

const OTHER = "Inne";

export function CategoriesTab({ onNavigate }: { onNavigate: Navigate }) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("Transport");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [data, meta] = await Promise.all([api.rules(), api.meta()]);
    setRules(data.rules);
    setCategories(data.categories);
    setLimits(Object.fromEntries((meta.limits || []).map((row) => [row.category, row.monthlyLimit])));
    if (!data.categories.includes(category) && data.categories[0]) setCategory(data.categories[0]);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  function notify(text: string) {
    setError("");
    setMessage(text);
  }

  async function addCategory(name: string) {
    const result = await api.addCategory(name);
    notify(`Dodano kategorię „${result.name}”.`);
    setCategories(result.categories);
    setCategory(result.name);
  }

  async function rename(item: string) {
    const next = editValue.trim();
    setEditing(null);
    if (!next || next === item) return;
    setError("");
    try {
      const result = await api.renameCategory(item, next);
      notify(`Zmieniono „${item}” na „${next}” (${result.updated} płatności).`);
      setCategories(result.categories);
      if (category === item) setCategory(next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zmieniono nazwy");
    }
  }

  async function remove(item: string) {
    if (!window.confirm(`Usunąć kategorię „${item}”? Płatności i reguły przejdą do Inne.`)) return;
    setError("");
    try {
      const result = await api.deleteCategory(item);
      notify(`Usunięto „${item}”. ${result.updated} płatności przeszło do Inne.`);
      setCategories(result.categories);
      if (category === item) setCategory(OTHER);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie usunięto kategorii");
    }
  }

  async function addRule() {
    setError("");
    try {
      const result = await api.addRule(pattern.trim(), category);
      notify(`Zapisano regułę. Zaktualizowano ${result.updated} operacji.`);
      setPattern("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano reguły");
    }
  }

  async function removeRule(rule: CategoryRule) {
    setError("");
    setRules((current) => current.filter((row) => row.id !== rule.id));
    try {
      await api.deleteRule(rule.id);
      notify(`Usunięto regułę „${rule.pattern}”. Płatności przeliczono od nowa.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie usunięto reguły");
    }
    await load().catch(() => undefined);
  }

  return (
    <>
      {message ? <p className="banner ok">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

      <div className="split">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>
                Twoje kategorie <span className="count">{categories.length}</span>
              </h2>
              <p className="card-sub">Zmiana nazwy przepisuje płatności i reguły.</p>
            </div>
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} />
              Nowa kategoria
            </button>
          </div>

          <div className="cat-table settings-cats">
            <div className="cat-table-head">
              <span>Kategoria</span>
              <span>Limit / mies.</span>
              <span />
            </div>
            {categories.map((item) => (
              <div key={item} className="cat-line">
                <div className="cat-line-name">
                  <span className="swatch" style={{ background: categoryColor(item) }} />
                  {editing === item ? (
                    <input
                      aria-label={`Nowa nazwa dla ${item}`}
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => void rename(item)}
                    />
                  ) : (
                    <span>{item}</span>
                  )}
                </div>
                <button type="button" className="link-btn quiet cat-limit" onClick={() => onNavigate("limits")}>
                  {limits[item] ? `${limits[item].toLocaleString("pl-PL")} zł` : "—"}
                </button>
                {item === OTHER ? (
                  <em className="cat-default">domyślna</em>
                ) : (
                  <div className="cat-actions">
                    <button
                      className="ghost sm"
                      type="button"
                      onClick={() => {
                        setEditing(item);
                        setEditValue(item);
                      }}
                    >
                      Zmień nazwę
                    </button>
                    <button className="ghost sm danger" type="button" onClick={() => void remove(item)}>
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="card-foot">
            Usunięcie przenosi płatności do <strong>Inne</strong>. Duże, jednorazowe płatności, które zasłaniają
            wykresy, możesz <strong>ukryć</strong> w Płatnościach (ikona oka) — zachowują swoją kategorię.
          </p>
        </article>

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
              if (pattern.trim()) void addRule();
            }}
          >
            <input
              aria-label="Fraza w opisie"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="np. koleo"
            />
            <select aria-label="Kategoria dla reguły" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <button className="primary" type="submit" disabled={!pattern.trim()}>
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
                    <span className="rule-cat">
                      <span className="swatch" style={{ background: categoryColor(rule.category) }} />
                      {rule.category}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Usuń regułę ${rule.pattern}`}
                    title="Usuń regułę"
                    onClick={() => void removeRule(rule)}
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
      </div>

      <NewCategoryDialog
        open={creating}
        categories={categories}
        onClose={() => setCreating(false)}
        onCreate={(name) => addCategory(name)}
      />
    </>
  );
}
