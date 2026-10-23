import { useState } from "react";
import { DEFAULT_CATEGORY } from "../../../shared/domain";
import { round2 } from "../../../shared/numbers";
import type { CategoryBudget, CategoryLimitSetting, CategoryRule } from "../../../shared/types";
import { getContext } from "../../app/AppContext";
import {
  CategoryLimits,
  NewCategoryDialog,
  addCategory,
  deleteCategory,
  deleteRule,
  renameCategory,
  setCategoryLimit,
  upsertRule,
} from "../../modules/categories";
import { toFilters } from "../../modules/payments";
import { PeriodBar, usePeriod } from "../../modules/period";
import { computeStats } from "../../modules/statistics";
import { Icon } from "../../ui/Icon";
import { Notices } from "../../ui/Notices";
import { money, percent } from "../../lib/format";
import { useAction } from "../../lib/useAction";
import { useAsync } from "../../lib/useAsync";
import { CategoryRow } from "./CategoryRow";
import { RulesCard } from "./RulesCard";
import "./categories-page.css";

export function CategoriesPage() {
  const { database, account, meta } = getContext();
  const { period, setPeriod } = usePeriod("month");
  const { categories, rules } = meta;
  const limits = limitMap(meta.limits);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(limits).map(([name, value]) => [name, formatLimit(value)])),
  );
  const [picked, setRuleCategory] = useState("Transport");
  const ruleCategory = categories.includes(picked) ? picked : categories[0] || picked;
  const [creating, setCreating] = useState(false);
  const { busy, message, error, setMessage, run } = useAction();
  const stats = useAsync(() => computeStats(database.data, toFilters(period, account)), [period.from, period.to]);

  function saveLimit(name: string) {
    return run(async () => {
      const next = parseLimit(drafts[name] ?? "");
      if (next !== (limits[name] ?? null)) {
        await database.update((draft) => setCategoryLimit(draft, name, next));
        setMessage(next ? `Limit „${name}”: ${money(next)} / mies.` : `Zdjęto limit z „${name}”.`);
        stats.reload();
      }
      setDrafts((current) => ({ ...current, [name]: formatLimit(limitMap(database.data.limits)[name]) }));
    }, "Nie zapisano limitu");
  }

  async function create(name: string) {
    const added = await database.update((draft) => addCategory(draft, name));
    setMessage(`Dodano kategorię „${added}”.`);
    setRuleCategory(added);
    setDrafts((current) => ({ ...current, [added]: "" }));
  }

  function rename(item: string, next: string) {
    return run(async () => {
      const updated = await database.update((draft) => renameCategory(draft, item, next));
      setMessage(`Zmieniono „${item}” na „${next}” (${updated} płatności).`);
      if (ruleCategory === item) setRuleCategory(next);
      setDrafts(({ [item]: moved, ...rest }) => (moved != null ? { ...rest, [next]: moved } : rest));
      stats.reload();
    }, "Nie zmieniono nazwy");
  }

  function remove(item: string) {
    if (!window.confirm(`Usunąć kategorię „${item}”? Płatności i reguły przejdą do Inne.`)) return;
    return run(async () => {
      const updated = await database.update((draft) => deleteCategory(draft, item));
      setMessage(`Usunięto „${item}”. ${updated} płatności przeszło do Inne.`);
      if (ruleCategory === item) setRuleCategory(DEFAULT_CATEGORY);
      setDrafts(({ [item]: _removed, ...rest }) => rest);
      stats.reload();
    }, "Nie usunięto kategorii");
  }

  function addRule(pattern: string, category: string) {
    return run(async () => {
      const result = await database.update((draft) => upsertRule(draft, pattern, category));
      setMessage(`Zapisano regułę. Zaktualizowano ${result.updated} operacji.`);
      stats.reload();
    }, "Nie zapisano reguły");
  }

  function removeRule(rule: CategoryRule) {
    return run(async () => {
      await database.update((draft) => deleteRule(draft, rule.id));
      setMessage(`Usunięto regułę „${rule.pattern}”. Płatności przeliczono od nowa.`);
      stats.reload();
    }, "Nie usunięto reguły");
  }

  const spent = new Map((stats.data?.byCategory || []).filter((row) => row.amount < 0).map((row) => [row.category, -row.amount]));
  const factor = stats.data?.limitMonths || 1;
  const budgets = stats.data?.limits || [];
  const rows = [...categories].sort((a, b) => {
    const limitDiff = Number(Boolean(limits[b])) - Number(Boolean(limits[a]));
    if (limitDiff) return limitDiff;
    if (a === DEFAULT_CATEGORY) return 1;
    if (b === DEFAULT_CATEGORY) return -1;
    return (spent.get(b) || 0) - (spent.get(a) || 0);
  });

  return (
    <section className="page">
      <PeriodBar page="Kategorie" period={period} onChange={setPeriod} />
      <Notices message={message} error={error || stats.error} />

      {budgets.length ? (
        <>
          <LimitKpis budgets={budgets} totalLimit={Object.values(limits).reduce((sum, value) => sum + value, 0)} />
          <CategoryLimits items={budgets} months={factor} title="Wykorzystanie w tym okresie" />
        </>
      ) : null}

      <article className="card">
        <div className="card-head">
          <div>
            <h2>
              Kategorie i limity <span className="count">{categories.length}</span>
            </h2>
            <p className="card-sub">Zmiana nazwy przepisuje płatności i reguły · limit: Enter albo klik poza pole · puste = bez limitu</p>
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
          {rows.map((item) => (
            <CategoryRow
              key={item}
              name={item}
              spent={spent.get(item) || 0}
              limit={limits[item]}
              factor={factor}
              draft={drafts[item] ?? ""}
              busy={busy}
              onDraft={(value) => setDrafts((current) => ({ ...current, [item]: value }))}
              onSaveLimit={() => void saveLimit(item)}
              onRename={(next) => void rename(item, next)}
              onRemove={() => void remove(item)}
            />
          ))}
        </div>
        <p className="card-foot">
          Usunięcie przenosi płatności do <strong>Inne</strong>. Wbudowane kategorie zachowują się tak samo jak własne — po resecie
          aplikacji wracają te podstawowe. Duże, jednorazowe płatności ukryjesz w Płatnościach (ikona oka).
        </p>
      </article>

      <RulesCard
        rules={rules}
        categories={categories}
        category={ruleCategory}
        busy={busy}
        onCategory={setRuleCategory}
        onAdd={addRule}
        onRemove={(rule) => void removeRule(rule)}
      />

      <NewCategoryDialog open={creating} categories={categories} onClose={() => setCreating(false)} onCreate={(name) => create(name)} />
    </section>
  );
}

function LimitKpis({ budgets, totalLimit }: { budgets: CategoryBudget[]; totalLimit: number }) {
  const spent = budgets.reduce((sum, row) => sum + row.spent, 0);
  const allowed = budgets.reduce((sum, row) => sum + row.allowed, 0);
  const over = budgets.filter((row) => row.status === "over").length;
  return (
    <div className="kpi-row">
      <div className="card kpi">
        <span>Suma limitów / mies.</span>
        <strong>{money(totalLimit)}</strong>
      </div>
      <div className="card kpi">
        <span>Wydane w kategoriach z limitem</span>
        <strong className={spent > allowed ? "neg" : undefined}>{money(spent)}</strong>
        <em>
          {percent(spent, allowed)} z {money(allowed)}
        </em>
      </div>
      <div className="card kpi">
        <span>Ponad limit</span>
        <strong className={over ? "neg" : "pos"}>
          {over} z {budgets.length}
        </strong>
      </div>
    </div>
  );
}

function formatLimit(value: number | undefined): string {
  return value == null ? "" : String(value).replace(".", ",");
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
