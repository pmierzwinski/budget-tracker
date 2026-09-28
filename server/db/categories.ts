import { BUILTIN_CATEGORIES, DEFAULT_CATEGORY, isBuiltinCategory } from "../../shared/domain.ts";
import { changes, db, transaction } from "./core.ts";

/** Built-in categories the user removed or renamed; their regex hits land in "Inne". */
export function hiddenCategoryNames(): Set<string> {
  return new Set((db.prepare("SELECT name FROM hidden_categories").all() as { name: string }[]).map((row) => row.name));
}

export function listCategories(): string[] {
  const custom = db.prepare("SELECT name FROM custom_categories ORDER BY name").all() as { name: string }[];
  const used = db.prepare("SELECT DISTINCT category FROM transactions").all() as { category: string }[];
  const hidden = hiddenCategoryNames();
  const names = [
    ...new Set([...BUILTIN_CATEGORIES, ...custom.map((row) => row.name), ...used.map((row) => row.category)]),
  ].filter((name) => name && name !== DEFAULT_CATEGORY && !hidden.has(name));
  names.sort((a, b) => a.localeCompare(b, "pl"));
  return [...names, DEFAULT_CATEGORY];
}

export function ensureCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  db.prepare("DELETE FROM hidden_categories WHERE name = ?").run(trimmed);
  if (isBuiltinCategory(trimmed)) return;
  db.prepare("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)").run(trimmed);
}

export function addCustomCategory(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Podaj nazwę kategorii");
  if (trimmed.length > 40) throw new Error("Nazwa może mieć najwyżej 40 znaków.");
  ensureCategory(trimmed);
  return trimmed;
}

/** Moves payments, rules and the limit of `source` to `target` and retires `source`. */
function moveCategory(source: string, target: string, keepLimit: boolean): number {
  const updated = changes(db.prepare("UPDATE transactions SET category = ? WHERE category = ?").run(target, source));
  db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(target, source);
  if (keepLimit) {
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(target);
    db.prepare("UPDATE category_limits SET category = ? WHERE category = ?").run(target, source);
  } else {
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(source);
  }
  db.prepare("DELETE FROM custom_categories WHERE name = ?").run(source);
  if (isBuiltinCategory(source)) db.prepare("INSERT OR IGNORE INTO hidden_categories (name) VALUES (?)").run(source);
  return updated;
}

export function renameCategory(from: string, to: string): { categories: string[]; updated: number } {
  const source = from.trim();
  const target = to.trim();
  if (!source || !target) throw new Error("Podaj obecną i nową nazwę.");
  if (source === DEFAULT_CATEGORY) {
    throw new Error("Kategorii „Inne” nie można zmienić — to domyślna dla nieskategoryzowanych.");
  }
  if (source === target) return { categories: listCategories(), updated: 0 };
  const updated = transaction(() => {
    ensureCategory(target);
    const count = moveCategory(source, target, true);
    db.prepare("DELETE FROM hidden_categories WHERE name = ?").run(target);
    return count;
  });
  return { categories: listCategories(), updated };
}

export function deleteCategory(name: string): { categories: string[]; updated: number } {
  const source = name.trim();
  if (!source) throw new Error("Podaj kategorię");
  if (source === DEFAULT_CATEGORY) {
    throw new Error("Kategorii „Inne” nie można usunąć — to miejsce na nieskategoryzowane płatności.");
  }
  const updated = transaction(() => moveCategory(source, DEFAULT_CATEGORY, false));
  return { categories: listCategories(), updated };
}

/** Payments still sitting in a category that has been hidden go back to "Inne". */
export function scrubHiddenCategories(): void {
  db.prepare("UPDATE transactions SET category = ? WHERE category IN (SELECT name FROM hidden_categories)").run(
    DEFAULT_CATEGORY,
  );
}
