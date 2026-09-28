import { useState } from "react";
import { DEFAULT_CATEGORY } from "../../../shared/domain.ts";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { Icon } from "../../components/Icon";
import { NewCategoryDialog } from "../../components/NewCategoryDialog";
import { CategoryTag, Swatch } from "../../components/ui/CategoryTag";
import { Notices } from "../../components/ui/Notices";
import { useAction } from "../../hooks/useAction";
import type { CategoryRule } from "../../types";

export function CategoriesTab() {
  const { meta, refreshMeta, navigate } = useApp();
  const { categories, rules } = meta;
  const limits = Object.fromEntries(meta.limits.map((row) => [row.category, row.monthlyLimit]));
  const [pattern, setPattern] = useState("");
  const [picked, setCategory] = useState("Transport");
  const category = categories.includes(picked) ? picked : categories[0] || picked;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { message, error, setMessage, run } = useAction();

  async function addCategory(name: string) {
    const result = await api.addCategory(name);
    setMessage(`Dodano kategorię „${result.name}”.`);
    setCategory(result.name);
    await refreshMeta();
  }

  function rename(item: string) {
    const next = editValue.trim();
    setEditing(null);
    if (!next || next === item) return;
    return run(async () => {
      const result = await api.renameCategory(item, next);
      setMessage(`Zmieniono „${item}” na „${next}” (${result.updated} płatności).`);
      if (category === item) setCategory(next);
      await refreshMeta();
    }, "Nie zmieniono nazwy");
  }

  function remove(item: string) {
    if (!window.confirm(`Usunąć kategorię „${item}”? Płatności i reguły przejdą do Inne.`)) return;
    return run(async () => {
      const result = await api.deleteCategory(item);
      setMessage(`Usunięto „${item}”. ${result.updated} płatności przeszło do Inne.`);
      if (category === item) setCategory(DEFAULT_CATEGORY);
      await refreshMeta();
    }, "Nie usunięto kategorii");
  }

  function addRule() {
    return run(async () => {
      const result = await api.addRule(pattern.trim(), category);
      setMessage(`Zapisano regułę. Zaktualizowano ${result.updated} operacji.`);
      setPattern("");
      await refreshMeta();
    }, "Nie zapisano reguły");
  }

  async function removeRule(rule: CategoryRule) {
    await run(async () => {
      await api.deleteRule(rule.id);
      setMessage(`Usunięto regułę „${rule.pattern}”. Płatności przeliczono od nowa.`);
    }, "Nie usunięto reguły");
    await refreshMeta().catch(() => undefined);
  }

  return (
    <>
      <Notices message={message} error={error} />

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
                  <Swatch category={item} />
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
                <button type="button" className="link-btn quiet cat-limit" onClick={() => navigate("limits")}>
                  {limits[item] ? `${limits[item].toLocaleString("pl-PL")} zł` : "—"}
                </button>
                {item === DEFAULT_CATEGORY ? (
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
                    <CategoryTag category={rule.category} />
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
