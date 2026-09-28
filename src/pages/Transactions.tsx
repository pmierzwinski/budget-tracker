import { useEffect, useState } from "react";
import { api } from "../api";
import { CategorySelect } from "../components/CategorySelect";
import { CommentNote } from "../components/CommentNote";
import { ExcludeToggle } from "../components/ExcludeToggle";
import { Icon } from "../components/Icon";
import type { Navigate } from "../components/Layout";
import { PeriodBar, allPeriod, type Period } from "../components/PeriodBar";
import { formatDay, money, plural } from "../format";
import type { Transaction } from "../types";

const OTHER = "Inne";
const ALL = "Wszystkie";

type Kind = "all" | "expense" | "income";
type Sort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category_asc" | "category_desc";

const KINDS: { id: Kind; label: string }[] = [
  { id: "all", label: "Wszystkie" },
  { id: "expense", label: "Wydatki" },
  { id: "income", label: "Przychody" },
];

function arrow(sort: Sort, field: "date" | "amount" | "category") {
  if (!sort.startsWith(field)) return "";
  return sort.endsWith("asc") ? " ↑" : " ↓";
}

export function Transactions({ onNavigate }: { onNavigate: Navigate }) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [category, setCategory] = useState(ALL);
  const [kind, setKind] = useState<Kind>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<Sort>("date_desc");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [matched, setMatched] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyAi, setBusyAi] = useState(false);
  const [uncategorized, setUncategorized] = useState(0);
  const [excludedCount, setExcludedCount] = useState(0);
  const [excludedOnly, setExcludedOnly] = useState(false);
  const [hasAiKey, setHasAiKey] = useState(true);

  const filtered = Boolean(q || minAmount || maxAmount || kind !== "all" || category !== ALL || excludedOnly);

  function applyMeta(meta: { uncategorized?: number; excluded?: number; hasAiKey?: boolean }) {
    setUncategorized(meta.uncategorized || 0);
    setExcludedCount(meta.excluded || 0);
    setHasAiKey(Boolean(meta.hasAiKey));
  }

  async function load(nextPeriod = period) {
    try {
      const data = await api.transactions({
        ...nextPeriod,
        category,
        q,
        minAmount,
        maxAmount,
        kind,
        sort,
        excludedOnly,
      });
      setItems(data.items);
      setMatched(data.matched);
      setCategories(data.categories);
      setBounds({ minDate: data.minDate, maxDate: data.maxDate });
      applyMeta(await api.meta());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd");
    }
  }

  useEffect(() => {
    api.meta().then((meta) => {
      setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
      applyMeta(meta);
      setPeriod((current) => (current.from ? current : allPeriod(meta.minDate, meta.maxDate)));
    });
  }, []);

  useEffect(() => {
    if (!period.from && !period.to) return;
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [period.from, period.to, category, q, minAmount, maxAmount, kind, sort, excludedOnly]);

  function toggleSort(field: "date" | "amount" | "category") {
    const desc = `${field}_desc` as Sort;
    const asc = `${field}_asc` as Sort;
    const first = field === "category" ? asc : desc;
    setSort(sort === first ? (first === asc ? desc : asc) : first);
  }

  function resetFilters() {
    setQ("");
    setKind("all");
    setCategory(ALL);
    setMinAmount("");
    setMaxAmount("");
    setExcludedOnly(false);
  }

  async function changeExcluded(item: Transaction, excluded: boolean) {
    setError("");
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, excluded } : row)));
    setExcludedCount((current) => current + (excluded ? 1 : -1));
    try {
      await api.setExcluded(item.id, excluded);
      setInfo(
        excluded
          ? `„${item.payee || item.title || "Płatność"}” nie liczy się już do wykresów, limitów ani wydatków.`
          : `„${item.payee || item.title || "Płatność"}” znów liczy się do statystyk.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano zmiany");
      await load();
    }
  }

  async function changeComment(item: Transaction, next: string) {
    setError("");
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, comment: next } : row)));
    try {
      await api.updateComment(item.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano komentarza");
      await load();
    }
  }

  async function changeCategory(item: Transaction, next: string, scope: "one" | "merchant") {
    setError("");
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, category: next } : row)));
    try {
      const result = await api.updateCategory(item.id, next, { onlyThis: scope === "one" });
      setCategories((current) =>
        current.includes(next) ? current : [...current.filter((name) => name !== OTHER), next, OTHER],
      );
      if (scope === "merchant") {
        const who = result.pattern || item.payee || item.title || "tego odbiorcy";
        setInfo(
          `Kategoria „${next}” dla wszystkich płatności od „${who}” — zmieniono ${result.updated} ${plural(
            result.updated,
            "płatność",
            "płatności",
            "płatności",
          )}. Przyszłe importy też tu trafią.`,
        );
        await load();
      } else {
        setInfo("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano kategorii");
      await load();
    }
  }

  async function categorizeWithAi() {
    setBusyAi(true);
    setError("");
    try {
      const result = await api.categorizeAi();
      setInfo(
        result.updated
          ? `AI ustawiło kategorię dla ${result.updated} płatności. Zostało ${result.remaining} jako Inne.`
          : "AI nie znalazło zmian — nic nie pasowało do istniejących kategorii.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategoryzacja AI nie powiodła się");
    } finally {
      setBusyAi(false);
    }
  }

  return (
    <section className="page tx-page">
      <PeriodBar
        page="Płatności"
        period={period}
        minDate={bounds.minDate}
        maxDate={bounds.maxDate}
        onChange={setPeriod}
      />

      <div className="card filter-bar">
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Szukaj płatności"
            placeholder="Szukaj: koleo, orlen, zmywarka…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="segmented" role="group" aria-label="Rodzaj operacji">
          {KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={kind === option.id ? "active" : undefined}
              aria-pressed={kind === option.id}
              onClick={() => setKind(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select aria-label="Kategoria" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value={ALL}>Wszystkie kategorie</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <div className="amount-range">
          <input
            inputMode="decimal"
            aria-label="Kwota od"
            placeholder="od zł"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <span aria-hidden>–</span>
          <input
            inputMode="decimal"
            aria-label="Kwota do"
            placeholder="do zł"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={category === OTHER ? "toggle-chip active" : "toggle-chip"}
          aria-pressed={category === OTHER}
          title="Płatności bez kategorii (Inne)"
          onClick={() => setCategory(category === OTHER ? ALL : OTHER)}
        >
          Nieskategoryzowane <span className="count">{uncategorized}</span>
        </button>
        {excludedCount || excludedOnly ? (
          <button
            type="button"
            className={excludedOnly ? "toggle-chip active" : "toggle-chip"}
            aria-pressed={excludedOnly}
            title="Płatności ukryte w statystykach"
            onClick={() => setExcludedOnly(!excludedOnly)}
          >
            <Icon name="eyeOff" size={14} />
            Ukryte <span className="count">{excludedCount}</span>
          </button>
        ) : null}
        {uncategorized ? (
          hasAiKey ? (
            <button type="button" className="primary" disabled={busyAi} onClick={() => void categorizeWithAi()}>
              <Icon name="sparkle" size={16} />
              {busyAi ? "AI kategoryzuje…" : "Skategoryzuj przez AI"}
            </button>
          ) : (
            <button
              type="button"
              className="ghost ai-setup"
              title="Kategoryzacja AI wymaga klucza OpenAI"
              onClick={() => onNavigate("settings", "ai")}
            >
              <Icon name="sparkle" size={16} />
              Ustaw klucz AI, żeby kategoryzować
            </button>
          )
        ) : null}
        <span className="result-count">
          {matched} {matched === 1 ? "operacja" : "operacji"}
          {filtered ? (
            <button type="button" className="link-btn quiet" onClick={resetFilters}>
              Wyczyść filtry
            </button>
          ) : null}
        </span>
      </div>

      {error ? <p className="banner error">{error}</p> : null}
      {info ? <p className="banner ok">{info}</p> : null}

      <div className="table-wrap tx-table">
        <table>
          <thead>
            <tr>
              <th className="col-date">
                <button type="button" className={sort.startsWith("date") ? "th-sort active" : "th-sort"} onClick={() => toggleSort("date")}>
                  Data{arrow(sort, "date")}
                </button>
              </th>
              <th>Odbiorca / opis</th>
              <th className="col-cat">
                <button
                  type="button"
                  className={sort.startsWith("category") ? "th-sort active" : "th-sort"}
                  title="Zmiana na liście dotyczy tylko tej płatności. „Wszystkie od odbiorcy…” ustawia kategorię dla wszystkich płatności od tego odbiorcy, także przyszłych."
                  onClick={() => toggleSort("category")}
                >
                  Kategoria{arrow(sort, "category")}
                </button>
              </th>
              <th className="num">
                <button type="button" className={sort.startsWith("amount") ? "th-sort active" : "th-sort"} onClick={() => toggleSort("amount")}>
                  Kwota{arrow(sort, "amount")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const description = [item.title, item.type].filter(Boolean).join(" · ");
              return (
                <tr
                  key={item.id}
                  className={[item.category === OTHER ? "uncat" : "", item.excluded ? "excluded" : ""].join(" ").trim() || undefined}
                >
                  <td className="tx-date">{formatDay(item.date)}</td>
                  <td className="tx-who">
                    <strong title={item.payee || undefined}>{item.payee || item.type || "Operacja"}</strong>
                    <div className="tx-desc">
                      {description ? <span title={description}>{description}</span> : null}
                      <CommentNote
                        compact
                        value={item.comment || ""}
                        onSave={(next) => void changeComment(item, next)}
                      />
                      <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => void changeExcluded(item, next)} />
                    </div>
                  </td>
                  <td>
                    <CategorySelect
                      value={item.category}
                      categories={categories}
                      who={item.payee || item.title || item.type || ""}
                      onChange={(next, scope) => void changeCategory(item, next, scope)}
                    />
                  </td>
                  <td className={item.amount < 0 ? "num neg strong" : "num pos strong"}>{money(item.amount)}</td>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={4} className="muted empty-row">
                  Brak transakcji dla wybranych filtrów.{" "}
                  {filtered ? (
                    <button type="button" className="link-btn" onClick={resetFilters}>
                      Wyczyść filtry
                    </button>
                  ) : (
                    "Sprawdź zakres dat."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
