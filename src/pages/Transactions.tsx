import { useEffect, useState } from "react";
import { api } from "../api";
import { CategorySelect } from "../components/CategorySelect";
import { CommentNote } from "../components/CommentNote";
import { PeriodBar, allPeriod, type Period } from "../components/PeriodBar";
import { money } from "../format";
import type { Transaction } from "../types";

const OTHER = "Inne";

export function Transactions() {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [category, setCategory] = useState("Wszystkie");
  const [kind, setKind] = useState<"all" | "expense" | "income">("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<
    "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "category_asc" | "category_desc"
  >("date_desc");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [matched, setMatched] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busyAi, setBusyAi] = useState(false);
  const [uncategorized, setUncategorized] = useState(0);

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
      });
      setItems(data.items);
      setMatched(data.matched);
      setCategories(data.categories);
      setBounds({ minDate: data.minDate, maxDate: data.maxDate });
      const meta = await api.meta();
      setUncategorized(meta.uncategorized || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd");
    }
  }

  useEffect(() => {
    api.meta().then((meta) => {
      setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
      setPeriod((current) => (current.from ? current : allPeriod(meta.minDate, meta.maxDate)));
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [period.from, period.to, category, q, minAmount, maxAmount, kind, sort]);

  async function changeComment(item: Transaction, next: string) {
    setError("");
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, comment: next } : row)),
    );
    try {
      await api.updateComment(item.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano komentarza");
      await load();
    }
  }

  async function changeCategory(item: Transaction, next: string, scope: "one" | "merchant") {
    setError("");
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, category: next } : row)),
    );
    try {
      const result = await api.updateCategory(item.id, next, { onlyThis: scope === "one" });
      setCategories((current) => (current.includes(next) ? current : [...current.filter((name) => name !== OTHER), next, OTHER]));
      if (scope === "merchant") {
        const who = result.pattern || item.payee || item.title || "tego pośrednika";
        setInfo(
          result.updated > 1
            ? `Kategoria „${next}” dla pośrednika „${who}” — zaktualizowano ${result.updated} płatności.`
            : `Kategoria „${next}” dla pośrednika „${who}”.`,
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

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Lista operacji</p>
          <h1>Płatności</h1>
        </div>
        <p className="muted">{matched} operacji w filtrze</p>
      </header>

      <p className="lede">
        Lista zmienia kategorię tylko tej płatności. Brak kategorii to <strong>{OTHER}</strong>. Rzadziej:
        przycisk „Dla pośrednika” ustawia ją też dla pozostałych płatności od tego sklepu.
      </p>
      <div className="row" style={{ margin: "-0.4rem 0 1rem" }}>
        <button
          className="primary"
          disabled={busyAi || !uncategorized}
          onClick={async () => {
            setBusyAi(true);
            setError("");
            try {
              const result = await api.categorizeAi();
              setInfo(
                result.updated
                  ? `AI ustawiło kategorię dla ${result.updated} płatności. Zostało ${result.remaining} jako Inne.`
                  : "AI nie znalazło zmian — brak klucza, albo nic nie było w Inne.",
              );
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Kategoryzacja AI nie powiodła się");
            } finally {
              setBusyAi(false);
            }
          }}
        >
          {busyAi ? "AI kategoryzuje…" : `Skategoryzuj Inne przez AI (${uncategorized})`}
        </button>
      </div>

      <PeriodBar period={period} minDate={bounds.minDate} maxDate={bounds.maxDate} onChange={setPeriod} />

      <div className="filters wrap">
        <label>
          Typ
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">Wszystkie</option>
            <option value="expense">Tylko wydatki</option>
            <option value="income">Tylko przychody</option>
          </select>
        </label>
        <label>
          Kwota od
          <input inputMode="decimal" placeholder="np. 50" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        </label>
        <label>
          Kwota do
          <input inputMode="decimal" placeholder="np. 500" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        </label>
        <label>
          Kategoria
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Wszystkie</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Sortowanie
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="date_desc">Data: najnowsze</option>
            <option value="date_asc">Data: najstarsze</option>
            <option value="amount_desc">Kwota: największe</option>
            <option value="amount_asc">Kwota: najmniejsze</option>
            <option value="category_asc">Kategoria A–Z</option>
            <option value="category_desc">Kategoria Z–A</option>
          </select>
        </label>
        <label className="grow">
          Szukaj
          <input placeholder="koleo, orlen, zmywarka…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button
          className={category === OTHER ? "primary" : "ghost"}
          type="button"
          onClick={() => setCategory(category === OTHER ? "Wszystkie" : OTHER)}
        >
          {category === OTHER ? "Pokaż wszystkie" : "Pokaż nieskategoryzowane"}
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}
      {info && <p className="banner ok">{info}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className={sort.startsWith("date") ? "th-sort active" : "th-sort"}
                  onClick={() => setSort(sort === "date_desc" ? "date_asc" : "date_desc")}
                >
                  Data {sort === "date_asc" ? "↑" : sort === "date_desc" ? "↓" : ""}
                </button>
              </th>
              <th>Pośrednik / opis</th>
              <th>
                <button
                  type="button"
                  className={sort.startsWith("category") ? "th-sort active" : "th-sort"}
                  onClick={() => setSort(sort === "category_asc" ? "category_desc" : "category_asc")}
                >
                  Kategoria {sort === "category_desc" ? "↓" : sort === "category_asc" ? "↑" : ""}
                </button>
              </th>
              <th className="num">
                <button
                  type="button"
                  className={sort.startsWith("amount") ? "th-sort active" : "th-sort"}
                  onClick={() => setSort(sort === "amount_desc" ? "amount_asc" : "amount_desc")}
                >
                  Kwota {sort === "amount_asc" ? "↑" : sort === "amount_desc" ? "↓" : ""}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const uncategorized = item.category === OTHER;
              return (
                <tr key={item.id} className={uncategorized ? "uncat" : undefined}>
                  <td className="nowrap">{item.date}</td>
                  <td>
                    <strong>{item.payee || item.type || "Operacja"}</strong>
                    <p className="muted">{[item.title, item.type].filter(Boolean).join(" · ")}</p>
                    <CommentNote value={item.comment || ""} onSave={(next) => void changeComment(item, next)} />
                  </td>
                  <td>
                    <CategorySelect
                      value={item.category}
                      categories={categories}
                      who={item.payee || item.title || item.type || ""}
                      onChange={(next, scope) => void changeCategory(item, next, scope)}
                    />
                  </td>
                  <td className={item.amount < 0 ? "num neg" : "num pos"}>{money(item.amount)}</td>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td colSpan={4} className="muted">
                  Brak transakcji dla wybranych filtrów. Sprawdź zakres dat i kwoty.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
