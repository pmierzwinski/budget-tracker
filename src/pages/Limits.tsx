import { useState } from "react";
import { DEFAULT_CATEGORY, limitStatus } from "../../shared/domain.ts";
import { round2 } from "../../shared/numbers.ts";
import { api } from "../api";
import { useApp } from "../app/AppContext";
import { CategoryLimits } from "../components/CategoryLimits";
import { Icon } from "../components/Icon";
import { NewCategoryDialog } from "../components/NewCategoryDialog";
import { PeriodBar } from "../components/PeriodBar";
import { CategoryTag, Swatch } from "../components/ui/CategoryTag";
import { Notices } from "../components/ui/Notices";
import { money, percent } from "../format";
import { useAction } from "../hooks/useAction";
import { useAsync } from "../hooks/useAsync";
import { usePeriod } from "../hooks/usePeriod";
import type { CategoryLimitSetting, CategoryRule } from "../types";

function formatLimit(value: number | undefined): string {
  if (value == null) return "";
  return String(value).replace(".", ",");
}

function parseLimit(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) throw new Error("Podaj dodatnią kwotę albo zostaw puste.");
  return value === 0 ? null : round2(value);
}

function limitMap(rows: CategoryLimitSetting[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.category, row.monthlyLimit]));
}

export function Limits() {
  const { meta, refreshMeta } = useApp();
  const { period, setPeriod } = usePeriod("month");
  const categories = meta.categories;
  const rules = meta.rules;
  const limits = limitMap(meta.limits);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(limits).map(([name, value]) => [name, formatLimit(value)])),
  );
  const [pattern, setPattern] = useState("");
  const [picked, setCategory] = useState("Transport");
  const category = categories.includes(picked) ? picked : categories[0] || picked;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { busy, message, error, setMessage, run } = useAction();
  const stats = useAsync(() => api.stats(period), [period.from, period.to]);

  function save(name: string) {
    return run(async () => {
      const next = parseLimit(drafts[name] ?? "");
      const prev = limits[name] ?? null;
      if (next === prev) {
        setDrafts((current) => ({ ...current, [name]: formatLimit(limits[name]) }));
        return;
      }
      const result = await api.setCategoryLimit(name, next);
      setDrafts((current) => ({ ...current, [name]: formatLimit(limitMap(result.limits)[name]) }));
      setMessage(next ? `Limit „${name}”: ${money(next)} / mies.` : `Zdjęto limit z „${name}”.`);
      await refreshMeta();
      stats.reload();
    }, "Nie zapisano limitu");
  }

  async function addCategory(name: string) {
    const result = await api.addCategory(name);
    setMessage(`Dodano kategorię „${result.name}”.`);
    setCategory(result.name);
    setDrafts((current) => ({ ...current, [result.name]: "" }));
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
      setDrafts((current) => {
        const copy = { ...current };
        if (copy[item] != null) {
          copy[next] = copy[item];
          delete copy[item];
        }
        return copy;
      });
      await refreshMeta();
      stats.reload();
    }, "Nie zmieniono nazwy");
  }

  function remove(item: string) {
    if (!window.confirm(`Usunąć kategorię „${item}”? Płatności i reguły przejdą do Inne.`)) return;
    return run(async () => {
      const result = await api.deleteCategory(item);
      setMessage(`Usunięto „${item}”. ${result.updated} płatności przeszło do Inne.`);
      if (category === item) setCategory(DEFAULT_CATEGORY);
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[item];
        return copy;
      });
      await refreshMeta();
      stats.reload();
    }, "Nie usunięto kategorii");
  }

  function addRule() {
    return run(async () => {
      const result = await api.addRule(pattern.trim(), category);
      setMessage(`Zapisano regułę. Zaktualizowano ${result.updated} operacji.`);
      setPattern("");
      await refreshMeta();
      stats.reload();
    }, "Nie zapisano reguły");
  }

  async function removeRule(rule: CategoryRule) {
    await run(async () => {
      await api.deleteRule(rule.id);
      setMessage(`Usunięto regułę „${rule.pattern}”. Płatności przeliczono od nowa.`);
    }, "Nie usunięto reguły");
    await refreshMeta().catch(() => undefined);
    stats.reload();
  }

  const spent = new Map((stats.data?.byCategory || []).filter((row) => row.amount < 0).map((row) => [row.category, -row.amount]));
  const factor = stats.data?.limitMonths || 1;
  const rows = [...categories].sort((a, b) => {
    const limitDiff = Number(Boolean(limits[b])) - Number(Boolean(limits[a]));
    if (limitDiff) return limitDiff;
    if (a === DEFAULT_CATEGORY) return 1;
    if (b === DEFAULT_CATEGORY) return -1;
    return (spent.get(b) || 0) - (spent.get(a) || 0);
  });
  const totalLimit = Object.values(limits).reduce((sum, value) => sum + value, 0);
  const budgets = stats.data?.limits || [];
  const limitedSpend = budgets.reduce((sum, row) => sum + row.spent, 0);
  const limitedAllowed = budgets.reduce((sum, row) => sum + row.allowed, 0);

  return (
    <section className="page">
      <PeriodBar page="Kategorie" period={period} onChange={setPeriod} />
      <Notices message={message} error={error || stats.error} />

      {budgets.length ? (
        <div className="kpi-row">
          <div className="card kpi">
            <span>Suma limitów / mies.</span>
            <strong>{money(totalLimit)}</strong>
          </div>
          <div className="card kpi">
            <span>Wydane w kategoriach z limitem</span>
            <strong className={limitedSpend > limitedAllowed ? "neg" : undefined}>{money(limitedSpend)}</strong>
            <em>
              {percent(limitedSpend, limitedAllowed)} z {money(limitedAllowed)}
            </em>
          </div>
          <div className="card kpi">
            <span>Ponad limit</span>
            <strong className={budgets.some((row) => row.status === "over") ? "neg" : "pos"}>
              {budgets.filter((row) => row.status === "over").length} z {budgets.length}
            </strong>
          </div>
        </div>
      ) : null}

      {stats.data && budgets.length ? (
        <CategoryLimits items={budgets} months={stats.data.limitMonths || 1} title="Wykorzystanie w tym okresie" />
      ) : null}

      <article className="card">
        <div className="card-head">
          <div>
            <h2>
              Kategorie i limity <span className="count">{categories.length}</span>
            </h2>
            <p className="card-sub">
              Zmiana nazwy przepisuje płatności i reguły · limit: Enter albo klik poza pole · puste = bez limitu
            </p>
          </div>
          <button className="primary" type="button" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            Nowa kategoria
          </button>
        </div>
        <div className="limit-table">
          <div className="limit-table-head">
            <span>Kategoria</span>
            <span className="num">Wydane w okresie</span>
            <span>Limit / mies.</span>
            <span>Wykorzystanie</span>
            <span />
          </div>
          {rows.map((item) => {
            const value = spent.get(item) || 0;
            const limit = limits[item];
            const allowed = limit ? limit * factor : 0;
            const ratio = allowed ? value / allowed : 0;
            const status = limitStatus(ratio);
            return (
              <div key={item} className={limit ? "limit-line has-limit" : "limit-line"}>
                <span className="cat-line-name">
                  <Swatch category={item} />
                  {editing === item ? (
                    <input
                      aria-label={`Nowa nazwa dla ${item}`}
                      value={editValue}
                      autoFocus
                      disabled={busy}
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
                </span>
                <span className="num">{value ? money(value) : "—"}</span>
                <div className="money-input">
                  <input
                    inputMode="decimal"
                    aria-label={`Limit miesięczny dla ${item}`}
                    placeholder="—"
                    disabled={busy}
                    value={drafts[item] ?? ""}
                    onChange={(e) => setDrafts((current) => ({ ...current, [item]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={() => void save(item)}
                  />
                  <span>zł</span>
                </div>
                {limit ? (
                  <span className="limit-usage">
                    <span className="limit-track" aria-hidden>
                      <span className={`limit-fill ${status}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </span>
                    <span className={`limit-pct ${status}`}>{percent(value, allowed)}</span>
                  </span>
                ) : (
                  <span className="muted limit-none">bez limitu</span>
                )}
                {item === DEFAULT_CATEGORY ? (
                  <em className="cat-default">domyślna</em>
                ) : (
                  <div className="cat-actions">
                    <button
                      className="ghost sm"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(item);
                        setEditValue(item);
                      }}
                    >
                      Zmień nazwę
                    </button>
                    <button className="ghost sm danger" type="button" disabled={busy} onClick={() => void remove(item)}>
                      Usuń
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="card-foot">
          Usunięcie przenosi płatności do <strong>Inne</strong>. Wbudowane kategorie zachowują się tak samo jak własne —
          po resecie aplikacji wracają te podstawowe. Duże, jednorazowe płatności ukryjesz w Płatnościach (ikona oka).
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

      <NewCategoryDialog
        open={creating}
        categories={categories}
        onClose={() => setCreating(false)}
        onCreate={(name) => addCategory(name)}
      />
    </section>
  );
}
