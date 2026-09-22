import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { categoryColor } from "../format";
import type { CategoryRule } from "../types";

const OTHER = "Inne";

function formatLimit(value: number | undefined): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

function parseLimit(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) throw new Error("Podaj dodatnią kwotę albo zostaw puste.");
  return value === 0 ? null : Math.round(value * 100) / 100;
}

export function Categories() {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("Transport");
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [hasAiKey, setHasAiKey] = useState(false);
  const [uncategorized, setUncategorized] = useState(0);
  const [busyAi, setBusyAi] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [data, meta] = await Promise.all([api.rules(), api.meta()]);
    setRules(data.rules);
    setCategories(data.categories);
    const nextLimits: Record<string, number> = {};
    const drafts: Record<string, string> = {};
    for (const row of meta.limits || []) {
      nextLimits[row.category] = row.monthlyLimit;
      drafts[row.category] = formatLimit(row.monthlyLimit);
    }
    setLimits(nextLimits);
    setLimitDrafts(drafts);
    setHasAiKey(Boolean(meta.hasAiKey));
    setUncategorized(meta.uncategorized || 0);
    if (!data.categories.includes(category) && data.categories[0]) setCategory(data.categories[0]);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  function notify(text: string) {
    setError("");
    setMessage(text);
  }

  async function addCategory() {
    setError("");
    try {
      const result = await api.addCategory(newName.trim());
      notify(`Dodano kategorię „${result.name}”.`);
      setNewName("");
      setCategories(result.categories);
      setCategory(result.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie dodano kategorii");
    }
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

  async function saveLimit(item: string) {
    try {
      const next = parseLimit(limitDrafts[item] ?? "");
      const prev = limits[item] ?? null;
      if (next === prev || (next == null && prev == null)) {
        setLimitDrafts((current) => ({ ...current, [item]: formatLimit(limits[item]) }));
        return;
      }
      setError("");
      const result = await api.setCategoryLimit(item, next);
      const map: Record<string, number> = {};
      const drafts: Record<string, string> = { ...limitDrafts };
      for (const row of result.limits) {
        map[row.category] = row.monthlyLimit;
        drafts[row.category] = formatLimit(row.monthlyLimit);
      }
      if (!map[item]) drafts[item] = "";
      setLimits(map);
      setLimitDrafts(drafts);
      notify(next ? `Limit „${item}”: ${next.toLocaleString("pl-PL")} zł / mies.` : `Zdjęto limit z „${item}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano limitu");
      setLimitDrafts((current) => ({ ...current, [item]: formatLimit(limits[item]) }));
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

  async function saveKey() {
    setError("");
    try {
      const result = await api.saveAiKey(aiKey.trim());
      setHasAiKey(result.hasAiKey);
      setAiKey("");
      notify("Zapisano klucz OpenAI.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano klucza");
    }
  }

  async function categorizeWithAi() {
    setBusyAi(true);
    setError("");
    try {
      const result = await api.categorizeAi();
      notify(
        result.updated
          ? `AI ustawiło kategorię dla ${result.updated} płatności (${result.groups} pośredników). Zostało ${result.remaining} jako Inne.`
          : "AI nie zmieniło kategorii — wszystko zostało jako Inne albo nie było czego kategoryzować.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategoryzacja AI nie powiodła się");
    } finally {
      setBusyAi(false);
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

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Kategorie</h1>
        </div>
      </header>

      {message ? <p className="banner ok">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

      <div className="split">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>
                Twoje kategorie <span className="count">{categories.length}</span>
              </h2>
              <p className="card-sub">Limit to kwota na miesiąc — na przeglądzie widać, ile już zeszło.</p>
            </div>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (newName.trim()) void addCategory();
              }}
            >
              <input
                aria-label="Nazwa nowej kategorii"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nowa kategoria, np. Pociągi"
              />
              <button className="primary" type="submit" disabled={!newName.trim()}>
                Dodaj
              </button>
            </form>
          </div>

          <div className="cat-table">
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
                <div className="money-input">
                  <input
                    inputMode="decimal"
                    aria-label={`Limit miesięczny dla ${item}`}
                    placeholder="—"
                    value={limitDrafts[item] ?? ""}
                    onChange={(e) => setLimitDrafts((current) => ({ ...current, [item]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={() => void saveLimit(item)}
                  />
                  <span>zł</span>
                </div>
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
            Usunięcie przenosi płatności do <strong>Inne</strong>. <strong>Poza statystykami</strong> liczy się w
            przychodach i bilansie, ale nie w wykresach kategorii.
          </p>
        </article>

        <div className="stack">
          <article className="card">
            <div className="card-head">
              <div>
                <h2 className="with-icon">
                  <Icon name="sparkle" size={16} />
                  Kategoryzacja AI
                </h2>
                <p className="card-sub">
                  Płatności z <strong>Inne</strong> idą do OpenAI razem z listą kategorii. Klucz zostaje na tym
                  komputerze.
                </p>
              </div>
              <span className={hasAiKey ? "pill ok" : "pill"}>{hasAiKey ? "klucz zapisany" : "brak klucza"}</span>
            </div>
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (aiKey.trim()) void saveKey();
              }}
            >
              <input
                type="password"
                aria-label="Klucz OpenAI"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder={hasAiKey ? "Wklej nowy klucz, żeby zmienić" : "sk-..."}
              />
              <button className="ghost" type="submit" disabled={!aiKey.trim()}>
                Zapisz klucz
              </button>
            </form>
            <div className="ai-run">
              <p>
                <strong>{uncategorized}</strong> {uncategorized === 1 ? "płatność" : "płatności"} w Inne
              </p>
              <button
                className="primary"
                type="button"
                disabled={busyAi || !uncategorized}
                onClick={() => void categorizeWithAi()}
              >
                {busyAi ? "Kategoryzuję…" : "Skategoryzuj przez AI"}
              </button>
            </div>
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
                      onClick={async () => {
                        await api.deleteRule(rule.id);
                        await load();
                      }}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted empty-note">
                Nie ma jeszcze własnych reguł — powstają też przy kategoryzacji płatności.
              </p>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
