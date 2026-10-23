// Categories, phrase rules and monthly limits — read from and written to the store.
import { BUILTIN_CATEGORIES, DEFAULT_CATEGORY, isBuiltinCategory, limitStatus } from "../../../shared/domain";
import { dayNumber, daysInMonth, shiftMonth } from "../../../shared/dates";
import { round2, round3 } from "../../../shared/numbers";
import type { Store } from "../../../shared/store";
import type { CategoryBudget, CategoryLimitSetting, CategoryRule, Transaction } from "../../../shared/types";
import { BUILTIN_RULES } from "./builtinRules";

/** Built-in, custom and in-use categories without the hidden ones, alphabetically, "Inne" last. */
export function listCategories(store: Store): string[] {
  const hidden = new Set(store.hiddenCategories);
  const used = store.transactions.map((tx) => tx.category);
  const names = [...new Set([...BUILTIN_CATEGORIES, ...store.customCategories, ...used])].filter(
    (name) => name && name !== DEFAULT_CATEGORY && !hidden.has(name),
  );
  names.sort((a, b) => a.localeCompare(b, "pl"));
  return [...names, DEFAULT_CATEGORY];
}

/** Rules newest first. */
export function listRules(store: Pick<Store, "rules">): CategoryRule[] {
  return [...store.rules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listLimits(store: Store): CategoryLimitSetting[] {
  return store.limits.filter((row) => row.monthlyLimit > 0).sort((a, b) => (a.category < b.category ? -1 : 1));
}

/** Makes the category exist: un-hides a built-in one, stores a custom one. */
export function ensureCategory(draft: Store, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (draft.hiddenCategories.includes(trimmed)) draft.hiddenCategories = draft.hiddenCategories.filter((item) => item !== trimmed);
  if (isBuiltinCategory(trimmed) || draft.customCategories.includes(trimmed)) return;
  draft.customCategories = [...draft.customCategories, trimmed].sort();
}

export function addCategory(draft: Store, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Podaj nazwę kategorii");
  if (trimmed.length > 40) throw new Error("Nazwa może mieć najwyżej 40 znaków.");
  ensureCategory(draft, trimmed);
  return trimmed;
}

/** Payments, rules and the limit go to the new name. Returns how many payments moved. */
export function renameCategory(draft: Store, from: string, to: string): number {
  const source = from.trim();
  const target = to.trim();
  if (!source || !target) throw new Error("Podaj obecną i nową nazwę.");
  if (source === DEFAULT_CATEGORY) throw new Error("Kategorii „Inne” nie można zmienić — to domyślna dla nieskategoryzowanych.");
  if (source === target) return 0;
  ensureCategory(draft, target);
  return moveCategory(draft, source, target, true);
}

/** Payments and rules go to "Inne", the limit is dropped. Returns how many payments moved. */
export function deleteCategory(draft: Store, name: string): number {
  const source = name.trim();
  if (!source) throw new Error("Podaj kategorię");
  if (source === DEFAULT_CATEGORY) throw new Error("Kategorii „Inne” nie można usunąć — to miejsce na nieskategoryzowane płatności.");
  return moveCategory(draft, source, DEFAULT_CATEGORY, false);
}

/** A retired built-in category is hidden, so the built-in regexes don't bring it back. */
function moveCategory(draft: Store, source: string, target: string, keepLimit: boolean): number {
  let moved = 0;
  draft.transactions = draft.transactions.map((tx) => {
    if (tx.category !== source) return tx;
    moved += 1;
    return { ...tx, category: target };
  });
  draft.rules = draft.rules.map((rule) => (rule.category === source ? { ...rule, category: target } : rule));
  const limit = draft.limits.find((row) => row.category === source);
  draft.limits = draft.limits.filter((row) => row.category !== source && !(keepLimit && limit && row.category === target));
  if (keepLimit && limit) draft.limits = [...draft.limits, { ...limit, category: target }];
  draft.customCategories = draft.customCategories.filter((item) => item !== source);
  if (isBuiltinCategory(source) && !draft.hiddenCategories.includes(source)) {
    draft.hiddenCategories = [...draft.hiddenCategories, source];
  }
  draft.hiddenCategories = draft.hiddenCategories.filter((item) => item !== target);
  return moved;
}

/** Empty, zero or invalid limit removes it. */
export function setCategoryLimit(draft: Store, category: string, monthlyLimit: number | null): void {
  const name = category.trim();
  if (!name) throw new Error("Podaj kategorię");
  const rest = draft.limits.filter((row) => row.category !== name);
  const valid = monthlyLimit != null && Number.isFinite(monthlyLimit) && monthlyLimit > 0;
  draft.limits = valid ? [...rest, { category: name, monthlyLimit: round2(monthlyLimit) }] : rest;
}

/** What a phrase rule matches: payee, title, description or type, case-insensitive. */
export function matchesPattern(tx: Transaction, pattern: string): boolean {
  const needle = pattern.toLowerCase();
  return [tx.payee, tx.title, tx.description, tx.type].some((text) => text.toLowerCase().includes(needle));
}

/** Creates or updates the rule and applies it to matching payments (manual ones only when `force`). */
export function upsertRule(
  draft: Store,
  pattern: string,
  category: string,
  options: { force?: boolean } = {},
): { rule: CategoryRule; updated: number } {
  const trimmed = pattern.trim();
  if (trimmed.length < 2) throw new Error("Fraza musi mieć co najmniej 2 znaki.");
  const target = category.trim() || DEFAULT_CATEGORY;
  ensureCategory(draft, target);
  const existing = draft.rules.find((rule) => rule.pattern.toLowerCase() === trimmed.toLowerCase());
  const rule = existing
    ? { ...existing, category: target }
    : { id: crypto.randomUUID(), pattern: trimmed, category: target, createdAt: new Date().toISOString() };
  draft.rules = existing ? draft.rules.map((row) => (row.id === rule.id ? rule : row)) : [...draft.rules, rule];
  let updated = 0;
  draft.transactions = draft.transactions.map((tx) => {
    if (!matchesPattern(tx, rule.pattern) || (tx.manualCategory && !options.force)) return tx;
    updated += 1;
    return { ...tx, category: rule.category, manualCategory: false };
  });
  return { rule, updated };
}

/** Deletes a rule and recategorizes everything, so its payments fall back to the remaining rules. */
export function deleteRule(draft: Store, id: string): void {
  draft.rules = draft.rules.filter((rule) => rule.id !== id);
  recategorizeAll(draft);
}

/** Runs the categorizer over every payment except manually categorized ones. Returns how many changed. */
export function recategorizeAll(draft: Store): number {
  const categorize = categorizer(draft);
  let changed = 0;
  draft.transactions = draft.transactions.map((tx) => {
    if (tx.manualCategory) return tx;
    const category = categorize(tx);
    if (category === tx.category) return tx;
    changed += 1;
    return { ...tx, category };
  });
  return changed;
}

type Categorizable = { payee: string; title: string; description: string; type: string; amount: number };

/**
 * Category for a payment: the first matching user rule, then the built-in regexes, then "Przelewy" for transfers
 * and every incoming payment, otherwise "Inne". Hidden categories end up in "Inne". Build once per batch.
 */
export function categorizer(store: Pick<Store, "rules" | "hiddenCategories">): (tx: Categorizable) => string {
  const rules = listRules(store)
    .map((rule) => ({ needle: rule.pattern.trim().toLowerCase(), category: rule.category }))
    .filter((rule) => rule.needle);
  const hidden = new Set(store.hiddenCategories);
  return (tx) => {
    const text = [tx.payee, tx.title, tx.description, tx.type].filter(Boolean).join(" ").replace(/\s+/g, " ");
    const haystack = text.toLowerCase();
    const category =
      rules.find((rule) => haystack.includes(rule.needle))?.category ||
      BUILTIN_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text)))?.category ||
      (/przelew|blik/i.test(text) || tx.amount > 0 ? "Przelewy" : DEFAULT_CATEGORY);
    return hidden.has(category) ? DEFAULT_CATEGORY : category;
  };
}

/** How many months (fractional, by days) the range covers — monthly limits are scaled by it. */
export function periodMonthFactor(from: string, to: string): number {
  if (!from || !to || from > to) return 1;
  let factor = 0;
  for (let cursor = from.slice(0, 7); cursor <= to.slice(0, 7); cursor = shiftMonth(cursor, 1)) {
    const [year, month] = cursor.split("-").map(Number);
    const lastDay = daysInMonth(year, month);
    const monthStart = `${cursor}-01`;
    const monthEnd = `${cursor}-${String(lastDay).padStart(2, "0")}`;
    const overlapStart = from > monthStart ? from : monthStart;
    const overlapEnd = to < monthEnd ? to : monthEnd;
    if (overlapStart <= overlapEnd) factor += (dayNumber(overlapEnd) - dayNumber(overlapStart) + 1) / lastDay;
  }
  return Math.max(round3(factor), 0.01);
}

const STATUS_RANK = { over: 0, warn: 1, ok: 2 };

/** Limit usage per category; `netByCategory` is the category balance in the period (spend is negative). */
export function budgets(store: Store, netByCategory: Map<string, number>, factor: number): CategoryBudget[] {
  const hidden = new Set(store.hiddenCategories);
  return store.limits
    .filter((row) => row.monthlyLimit > 0 && !hidden.has(row.category))
    .map((row) => {
      const net = netByCategory.get(row.category) || 0;
      const spent = net < 0 ? -net : 0;
      const allowed = round2(row.monthlyLimit * factor);
      const ratio = allowed > 0 ? spent / allowed : 0;
      return {
        category: row.category,
        monthlyLimit: row.monthlyLimit,
        allowed,
        spent: round2(spent),
        remaining: round2(allowed - spent),
        ratio: round3(ratio),
        status: limitStatus(ratio),
      };
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.ratio - a.ratio);
}
