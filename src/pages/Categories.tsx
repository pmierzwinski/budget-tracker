import { useEffect, useState } from "react";
import { api } from "../api";
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

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Słownik</p>
          <h1>Kategorie</h1>
        </div>
      </header>

      <div className="grid-2">
        <article className="card">
          <h2>Nowa kategoria</h2>
          <p>Dodaj własną kategorię zakupów. Potem przypiszesz ją płatnościom na liście — wszystkie od tego pośrednika dostaną tę samą.</p>
          <label>
            Nazwa
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="np. Pociągi" />
          </label>
          <button
            className="primary"
            disabled={!newName.trim()}
            onClick={async () => {
              setError("");
              try {
                const result = await api.addCategory(newName.trim());
                setMessage(`Dodano kategorię „${result.name}”.`);
                setNewName("");
                setCategories(result.categories);
                setCategory(result.name);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Nie dodano kategorii");
              }
            }}
          >
            Dodaj kategorię
          </button>
          {message && <p className="banner ok">{message}</p>}
          {error && <p className="banner error">{error}</p>}
        </article>

        <article className="card">
          <h2>Twoje kategorie</h2>
          <p className="muted">
            Limit to kwota na miesiąc. Na przeglądzie widać, ile już zeszło i czy został przekroczony. Usunięcie
            przenosi płatności do <strong>Inne</strong>.{" "}
            <strong>Poza statystykami</strong> zostaje w przychodach i tym, ile zostaje, ale nie wchodzi
            do wykresów kategorii.
          </p>
          <ul className="cat-list">
            {categories.map((item) => (
              <li key={item}>
                <span style={{ background: categoryColor(item) }} />
                {editing === item ? (
                  <input
                    className="grow"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                    onBlur={async () => {
                      const next = editValue.trim();
                      setEditing(null);
                      if (!next || next === item) return;
                      setError("");
                      try {
                        const result = await api.renameCategory(item, next);
                        setMessage(`Zmieniono „${item}” na „${next}” (${result.updated} płatności).`);
                        setCategories(result.categories);
                        if (category === item) setCategory(next);
                        await load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Nie zmieniono nazwy");
                      }
                    }}
                  />
                ) : (
                  <strong className="cat-list-name">{item}</strong>
                )}
                <label className="limit-field">
                  Limit
                  <input
                    inputMode="decimal"
                    placeholder="zł / mies."
                    value={limitDrafts[item] ?? ""}
                    onChange={(e) =>
                      setLimitDrafts((current) => ({ ...current, [item]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={async () => {
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
                        setMessage(
                          next
                            ? `Limit „${item}”: ${next.toLocaleString("pl-PL")} zł / mies.`
                            : `Zdjęto limit z „${item}”.`,
                        );
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Nie zapisano limitu");
                        setLimitDrafts((current) => ({ ...current, [item]: formatLimit(limits[item]) }));
                      }
                    }}
                  />
                </label>
                {item === OTHER ? (
                  <em className="muted">domyślna</em>
                ) : (
                  <span className="cat-list-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => {
                        setEditing(item);
                        setEditValue(item);
                      }}
                    >
                      Edytuj
                    </button>
                    <button
                      className="ghost danger"
                      type="button"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Usunąć kategorię „${item}”? Płatności i reguły przejdą do Inne.`,
                          )
                        ) {
                          return;
                        }
                        setError("");
                        try {
                          const result = await api.deleteCategory(item);
                          setMessage(
                            `Usunięto „${item}”. ${result.updated} płatności przeszło do Inne.`,
                          );
                          setCategories(result.categories);
                          if (category === item) setCategory("Inne");
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Nie usunięto kategorii");
                        }
                      }}
                    >
                      Usuń
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="card" style={{ marginTop: "1rem" }}>
        <h2>Kategoryzacja AI</h2>
        <p>
          Nowe i nieskategoryzowane płatności (<strong>Inne</strong>) można oddać modelowi OpenAI. Dostanie listę
          Twoich kategorii i nazwy pośredników. Opisy idą do OpenAI — klucz zostaje na tym komputerze.
        </p>
        <p className="muted">Nieskategoryzowanych: {uncategorized}</p>
        <label>
          Klucz OpenAI {hasAiKey ? "(zapisany)" : ""}
          <input
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder={hasAiKey ? "••••••••  (wklej, żeby zmienić)" : "sk-..."}
          />
        </label>
        <div className="row">
          <button
            className="ghost"
            disabled={!aiKey.trim()}
            onClick={async () => {
              setError("");
              try {
                const result = await api.saveAiKey(aiKey.trim());
                setHasAiKey(result.hasAiKey);
                setAiKey("");
                setMessage("Zapisano klucz OpenAI.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Nie zapisano klucza");
              }
            }}
          >
            Zapisz klucz
          </button>
          <button
            className="primary"
            disabled={busyAi || !uncategorized}
            onClick={async () => {
              setBusyAi(true);
              setError("");
              try {
                const result = await api.categorizeAi();
                setMessage(
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
            }}
          >
            {busyAi ? "Kategoryzuję…" : "Skategoryzuj Inne przez AI"}
          </button>
        </div>
      </article>

      <article className="card" style={{ marginTop: "1rem" }}>
        <h2>Reguła po frazie</h2>
        <p>
          Opcjonalnie: jeśli w opisie pojawi się fraza — np. <strong>koleo</strong> — operacja dostanie wybraną
          kategorię. Działa też przy imporcie.
        </p>
        <div className="filters wrap">
          <label>
            Fraza w opisie
            <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="koleo" />
          </label>
          <label>
            Kategoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={!pattern.trim()}
            onClick={async () => {
              setError("");
              try {
                const result = await api.addRule(pattern.trim(), category);
                setMessage(`Zapisano. Zaktualizowano ${result.updated} operacji.`);
                setPattern("");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Nie zapisano reguły");
              }
            }}
          >
            Zapisz i zastosuj
          </button>
        </div>
        {!rules.length && <p className="muted">Nie ma jeszcze własnych reguł — powstają też przy kategoryzacji płatności.</p>}
        <ul className="rules">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span>
                <strong>{rule.pattern}</strong> → {rule.category}
              </span>
              <button
                className="ghost"
                onClick={async () => {
                  await api.deleteRule(rule.id);
                  await load();
                }}
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
