import { randomUUID } from "node:crypto";
import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import type { CategoryRule } from "../shared/types.ts";
import type { Database } from "../core/Database.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import { ChainCategorizer, type Categorizer } from "./categorizer/Categorizer.ts";
import type { CategoryService } from "./CategoryService.ts";
import type { RuleRepository } from "./RuleRepository.ts";

/** Phrase rules (payee text → category): the first matching user rule wins, then built-in regexes. */
export class RuleService {
  readonly #database: Database;
  readonly #rules: RuleRepository;
  readonly #transactions: TransactionRepository;
  readonly #categories: CategoryService;

  constructor(database: Database, rules: RuleRepository, transactions: TransactionRepository, categories: CategoryService) {
    this.#database = database;
    this.#rules = rules;
    this.#transactions = transactions;
    this.#categories = categories;
  }

  list(): CategoryRule[] {
    return this.#rules.list();
  }

  /** Categorizer with the current user rules and hidden categories; build once per batch. */
  categorizer(): Categorizer {
    return ChainCategorizer.withRules(this.#rules.list(), this.#categories.hiddenNames());
  }

  /** Creates or updates the rule and applies it to matching payments (manual ones only when `force`). */
  upsert(pattern: string, category: string, options: { force?: boolean } = {}): { rule: CategoryRule; updated: number } {
    const trimmed = pattern.trim();
    if (trimmed.length < 2) throw new Error("Fraza musi mieć co najmniej 2 znaki.");
    const target = category.trim() || DEFAULT_CATEGORY;
    this.#categories.ensure(target);
    const existing = this.#rules.findByPattern(trimmed);
    let rule: CategoryRule;
    if (existing) {
      this.#rules.setCategory(existing.id, target);
      rule = { ...existing, category: target };
    } else {
      rule = { id: randomUUID(), pattern: trimmed, category: target, createdAt: new Date().toISOString() };
      this.#rules.insert(rule);
    }
    return { rule, updated: this.#transactions.applyRule(rule.pattern, rule.category, Boolean(options.force)) };
  }

  /** Deletes a rule and recategorizes everything, so its payments fall back to the remaining rules. */
  delete(id: string): void {
    this.#rules.delete(id);
    this.recategorizeAll();
  }

  /** Runs the categorizer over every payment except manually categorized ones. */
  recategorizeAll(): number {
    const categorizer = this.categorizer();
    const updates: { id: string; category: string }[] = [];
    for (const tx of this.#transactions.listAll()) {
      if (tx.manualCategory) continue;
      const category = categorizer.categorize(tx);
      if (category !== tx.category) updates.push({ id: tx.id, category });
    }
    this.#database.transaction(() => this.#transactions.updateCategories(updates));
    this.#categories.scrubHidden();
    return updates.length;
  }
}
