import { BUILTIN_CATEGORIES, DEFAULT_CATEGORY, isBuiltinCategory } from "../shared/domain.ts";
import type { Database } from "../core/Database.ts";
import type { CategoryRepository } from "./CategoryRepository.ts";
import type { LimitRepository } from "./LimitRepository.ts";
import type { RuleRepository } from "./RuleRepository.ts";

type CategoryChange = { categories: string[]; updated: number };

/**
 * Category list and its edits. Built-in and custom categories behave the same; a removed or renamed built-in
 * one is hidden so the regexes don't bring it back. "Inne" cannot be removed or renamed and is always last.
 */
export class CategoryService {
  readonly #database: Database;
  readonly #categories: CategoryRepository;
  readonly #rules: RuleRepository;
  readonly #limits: LimitRepository;

  constructor(database: Database, categories: CategoryRepository, rules: RuleRepository, limits: LimitRepository) {
    this.#database = database;
    this.#categories = categories;
    this.#rules = rules;
    this.#limits = limits;
  }

  hiddenNames(): Set<string> {
    return this.#categories.hiddenNames();
  }

  list(): string[] {
    const hidden = this.#categories.hiddenNames();
    const names = [...new Set([...BUILTIN_CATEGORIES, ...this.#categories.customNames(), ...this.#categories.usedNames()])].filter(
      (name) => name && name !== DEFAULT_CATEGORY && !hidden.has(name),
    );
    names.sort((a, b) => a.localeCompare(b, "pl"));
    return [...names, DEFAULT_CATEGORY];
  }

  /** Makes the category exist (un-hides a built-in one, stores a custom one). */
  ensure(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.#categories.unhide(trimmed);
    if (isBuiltinCategory(trimmed)) return;
    this.#categories.addCustom(trimmed);
  }

  add(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Podaj nazwę kategorii");
    if (trimmed.length > 40) throw new Error("Nazwa może mieć najwyżej 40 znaków.");
    this.ensure(trimmed);
    return trimmed;
  }

  rename(from: string, to: string): CategoryChange {
    const source = from.trim();
    const target = to.trim();
    if (!source || !target) throw new Error("Podaj obecną i nową nazwę.");
    if (source === DEFAULT_CATEGORY) {
      throw new Error("Kategorii „Inne” nie można zmienić — to domyślna dla nieskategoryzowanych.");
    }
    if (source === target) return { categories: this.list(), updated: 0 };
    const updated = this.#database.transaction(() => {
      this.ensure(target);
      const count = this.#move(source, target, true);
      this.#categories.unhide(target);
      return count;
    });
    return { categories: this.list(), updated };
  }

  delete(name: string): CategoryChange {
    const source = name.trim();
    if (!source) throw new Error("Podaj kategorię");
    if (source === DEFAULT_CATEGORY) {
      throw new Error("Kategorii „Inne” nie można usunąć — to miejsce na nieskategoryzowane płatności.");
    }
    const updated = this.#database.transaction(() => this.#move(source, DEFAULT_CATEGORY, false));
    return { categories: this.list(), updated };
  }

  /** Payments still sitting in a category that has been hidden go back to "Inne". */
  scrubHidden(): void {
    this.#categories.movePaymentsOutOfHidden(DEFAULT_CATEGORY);
  }

  /** Moves payments, rules and the limit of `source` to `target` and retires `source`. */
  #move(source: string, target: string, keepLimit: boolean): number {
    const updated = this.#categories.movePayments(source, target);
    this.#rules.moveCategory(source, target);
    if (keepLimit) this.#limits.move(source, target);
    else this.#limits.delete(source);
    this.#categories.removeCustom(source);
    if (isBuiltinCategory(source)) this.#categories.hide(source);
    return updated;
  }
}
