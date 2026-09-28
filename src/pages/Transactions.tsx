import { useState } from "react";
import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import { api } from "../api";
import { useApp } from "../app/AppContext";
import { CategorySelect } from "../components/CategorySelect";
import { CommentNote } from "../components/CommentNote";
import { ExcludeToggle } from "../components/ExcludeToggle";
import { Icon } from "../components/Icon";
import { PeriodBar } from "../components/PeriodBar";
import { Notices } from "../components/ui/Notices";
import { Segmented } from "../components/ui/Segmented";
import { formatDay, money, plural, txName, txWho } from "../format";
import { useAction } from "../hooks/useAction";
import { usePeriod } from "../hooks/usePeriod";
import { useTransactionEdits, type TransactionChange } from "../hooks/useTransactionEdits";
import { useTransactionList } from "../hooks/useTransactionList";
import { aiCategorizedMessage } from "../messages";
import type { TxKind, TxSort } from "../types";

const ALL = "Wszystkie";

const KINDS: { id: TxKind; label: string }[] = [
  { id: "all", label: "Wszystkie" },
  { id: "expense", label: "Wydatki" },
  { id: "income", label: "Przychody" },
];

type SortField = "date" | "amount" | "category";

function arrow(sort: TxSort, field: SortField) {
  if (!sort.startsWith(field)) return "";
  return sort.endsWith("asc") ? " ↑" : " ↓";
}

function savedMessage(change: TransactionChange): string {
  if (change.type === "excluded") {
    const who = change.item.payee || change.item.title || "Płatność";
    return change.excluded
      ? `„${who}” nie liczy się już do wykresów, limitów ani wydatków.`
      : `„${who}” znów liczy się do statystyk.`;
  }
  if (change.type === "category" && change.scope === "merchant") {
    const who = change.pattern || change.item.payee || change.item.title || "tego odbiorcy";
    return `Kategoria „${change.category}” dla wszystkich płatności od „${who}” — zmieniono ${change.updated} ${plural(
      change.updated,
      "płatność",
      "płatności",
      "płatności",
    )}. Przyszłe importy też tu trafią.`;
  }
  return "";
}

export function Transactions() {
  const { meta, refreshMeta, navigate } = useApp();
  const { period, setPeriod } = usePeriod("all");
  const [category, setCategory] = useState(ALL);
  const [kind, setKind] = useState<TxKind>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<TxSort>("date_desc");
  const [q, setQ] = useState("");
  const [excludedOnly, setExcludedOnly] = useState(false);
  const ai = useAction();

  const list = useTransactionList(
    () => api.transactions({ ...period, category, q, minAmount, maxAmount, kind, sort, excludedOnly }),
    [period.from, period.to, category, q, minAmount, maxAmount, kind, sort, excludedOnly],
    150,
  );
  const edits = useTransactionEdits({
    updateItems: list.updateItems,
    addCategory: list.addCategory,
    onSaved: async (change) => {
      ai.setError("");
      if (change.type === "comment") return;
      ai.setMessage(savedMessage(change));
      await refreshMeta();
    },
    onFailed: (message) => {
      ai.setError(message);
      list.reload();
    },
  });

  const { items, categories } = list;
  const matched = list.data?.matched || 0;
  const filtered = Boolean(q || minAmount || maxAmount || kind !== "all" || category !== ALL || excludedOnly);

  function toggleSort(field: SortField) {
    const desc = `${field}_desc` as TxSort;
    const asc = `${field}_asc` as TxSort;
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

  function categorizeWithAi() {
    return ai.run(async () => {
      const result = await api.categorizeAi();
      ai.setMessage(aiCategorizedMessage(result));
      list.reload();
      await refreshMeta();
    }, "Kategoryzacja AI nie powiodła się");
  }

  function sortButton(field: SortField, label: string, title?: string) {
    return (
      <button
        type="button"
        className={sort.startsWith(field) ? "th-sort active" : "th-sort"}
        title={title}
        onClick={() => toggleSort(field)}
      >
        {label}
        {arrow(sort, field)}
      </button>
    );
  }

  return (
    <section className="page tx-page">
      <PeriodBar page="Płatności" period={period} onChange={setPeriod} />

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
        <Segmented options={KINDS} value={kind} onChange={setKind} label="Rodzaj operacji" />
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
          className={category === DEFAULT_CATEGORY ? "toggle-chip active" : "toggle-chip"}
          aria-pressed={category === DEFAULT_CATEGORY}
          title="Płatności bez kategorii (Inne)"
          onClick={() => setCategory(category === DEFAULT_CATEGORY ? ALL : DEFAULT_CATEGORY)}
        >
          Nieskategoryzowane <span className="count">{meta.uncategorized}</span>
        </button>
        {meta.excluded || excludedOnly ? (
          <button
            type="button"
            className={excludedOnly ? "toggle-chip active" : "toggle-chip"}
            aria-pressed={excludedOnly}
            title="Płatności ukryte w statystykach"
            onClick={() => setExcludedOnly(!excludedOnly)}
          >
            <Icon name="eyeOff" size={14} />
            Ukryte <span className="count">{meta.excluded}</span>
          </button>
        ) : null}
        {meta.uncategorized ? (
          meta.hasAiKey ? (
            <button type="button" className="primary" disabled={ai.busy} onClick={() => void categorizeWithAi()}>
              <Icon name="sparkle" size={16} />
              {ai.busy ? "AI kategoryzuje…" : "Skategoryzuj przez AI"}
            </button>
          ) : (
            <button
              type="button"
              className="ghost ai-setup"
              title="Kategoryzacja AI wymaga klucza OpenAI"
              onClick={() => navigate("settings", "ai")}
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

      <Notices error={ai.error || list.error} message={ai.message} />

      <div className="table-wrap tx-table">
        <table>
          <thead>
            <tr>
              <th className="col-date">{sortButton("date", "Data")}</th>
              <th>Odbiorca / opis</th>
              <th className="col-cat">
                {sortButton(
                  "category",
                  "Kategoria",
                  "Zmiana na liście dotyczy tylko tej płatności. „Wszystkie od odbiorcy…” ustawia kategorię dla wszystkich płatności od tego odbiorcy, także przyszłych.",
                )}
              </th>
              <th className="num">{sortButton("amount", "Kwota")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const description = [item.title, item.type].filter(Boolean).join(" · ");
              return (
                <tr
                  key={item.id}
                  className={
                    [item.category === DEFAULT_CATEGORY ? "uncat" : "", item.excluded ? "excluded" : ""].join(" ").trim() ||
                    undefined
                  }
                >
                  <td className="tx-date">{formatDay(item.date)}</td>
                  <td className="tx-who">
                    <strong title={item.payee || undefined}>{txName(item)}</strong>
                    <div className="tx-desc">
                      {description ? <span title={description}>{description}</span> : null}
                      <CommentNote compact value={item.comment || ""} onSave={(next) => void edits.changeComment(item, next)} />
                      <ExcludeToggle compact excluded={item.excluded} onToggle={(next) => void edits.changeExcluded(item, next)} />
                    </div>
                  </td>
                  <td>
                    <CategorySelect
                      value={item.category}
                      categories={categories}
                      who={txWho(item)}
                      onChange={(next, scope) => void edits.changeCategory(item, next, scope)}
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
