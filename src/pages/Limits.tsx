import { useEffect, useState } from "react";
import { api } from "../api";
import { CategoryLimits } from "../components/CategoryLimits";
import { PeriodBar, latestMonthPeriod, type Period } from "../components/PeriodBar";
import { categoryColor, money, percent } from "../format";
import type { Stats } from "../types";

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

export function Limits() {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .meta()
      .then((meta) => {
        setBounds({ minDate: meta.minDate, maxDate: meta.maxDate });
        setCategories(meta.categories);
        const map: Record<string, number> = {};
        for (const row of meta.limits || []) map[row.category] = row.monthlyLimit;
        setLimits(map);
        setDrafts(Object.fromEntries(Object.entries(map).map(([name, value]) => [name, formatLimit(value)])));
        setPeriod((current) => (current.from ? current : latestMonthPeriod(meta.maxDate)));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!period.from) return;
    let alive = true;
    api
      .stats(period)
      .then((next) => alive && setStats(next))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [period.from, period.to]);

  async function save(category: string) {
    try {
      const next = parseLimit(drafts[category] ?? "");
      const prev = limits[category] ?? null;
      if (next === prev) {
        setDrafts((current) => ({ ...current, [category]: formatLimit(limits[category]) }));
        return;
      }
      setError("");
      const result = await api.setCategoryLimit(category, next);
      const map: Record<string, number> = {};
      for (const row of result.limits) map[row.category] = row.monthlyLimit;
      setLimits(map);
      setDrafts((current) => ({ ...current, [category]: formatLimit(map[category]) }));
      setMessage(next ? `Limit „${category}”: ${money(next)} / mies.` : `Zdjęto limit z „${category}”.`);
      setStats(await api.stats(period));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano limitu");
      setDrafts((current) => ({ ...current, [category]: formatLimit(limits[category]) }));
    }
  }

  const spent = new Map((stats?.byCategory || []).filter((row) => row.amount < 0).map((row) => [row.category, -row.amount]));
  const factor = stats?.limitMonths || 1;
  const rows = [...categories].sort((a, b) => {
    const limitDiff = Number(Boolean(limits[b])) - Number(Boolean(limits[a]));
    if (limitDiff) return limitDiff;
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return (spent.get(b) || 0) - (spent.get(a) || 0);
  });
  const totalLimit = Object.values(limits).reduce((sum, value) => sum + value, 0);
  const budgets = stats?.limits || [];
  const limitedSpend = budgets.reduce((sum, row) => sum + row.spent, 0);
  const limitedAllowed = budgets.reduce((sum, row) => sum + row.allowed, 0);

  return (
    <section className="page">
      <PeriodBar page="Limity" period={period} minDate={bounds.minDate} maxDate={bounds.maxDate} onChange={setPeriod} />
      {message ? <p className="banner ok">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

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

      {stats && budgets.length ? (
        <CategoryLimits items={budgets} months={stats.limitMonths || 1} title="Wykorzystanie w tym okresie" />
      ) : null}

      <article className="card">
        <div className="card-head">
          <div>
            <h2>Limity miesięczne</h2>
            <p className="card-sub">
              Wpisz kwotę i naciśnij Enter · puste pole = bez limitu · dla dłuższych okresów limit jest skalowany
            </p>
          </div>
        </div>
        <div className="limit-table">
          <div className="limit-table-head">
            <span>Kategoria</span>
            <span className="num">Wydane w okresie</span>
            <span>Limit / mies.</span>
            <span>Wykorzystanie</span>
          </div>
          {rows.map((category) => {
            const value = spent.get(category) || 0;
            const limit = limits[category];
            const allowed = limit ? limit * factor : 0;
            const ratio = allowed ? value / allowed : 0;
            const status = ratio > 1.001 ? "over" : ratio >= 0.85 ? "warn" : "ok";
            return (
              <div key={category} className={limit ? "limit-line has-limit" : "limit-line"}>
                <span className="cat-line-name">
                  <span className="swatch" style={{ background: categoryColor(category) }} />
                  <span>{category}</span>
                </span>
                <span className="num">{value ? money(value) : "—"}</span>
                <div className="money-input">
                  <input
                    inputMode="decimal"
                    aria-label={`Limit miesięczny dla ${category}`}
                    placeholder="—"
                    value={drafts[category] ?? ""}
                    onChange={(e) => setDrafts((current) => ({ ...current, [category]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    onBlur={() => void save(category)}
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
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
