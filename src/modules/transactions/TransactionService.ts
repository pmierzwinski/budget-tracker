import { DEFAULT_CATEGORY, merchantPattern } from "../shared/domain.ts";
import type { TransactionsResult, TxFilters } from "../shared/types.ts";
import type { CategoryService } from "../categories/CategoryService.ts";
import type { RuleService } from "../categories/RuleService.ts";
import type { TransactionRepository } from "./TransactionRepository.ts";

export type CategoryChangeOptions = { onlyThis?: boolean; force?: boolean; manual?: boolean };

/** Payment list and edits of a single payment (category, comment, hiding). */
export class TransactionService {
  readonly #transactions: TransactionRepository;
  readonly #categories: CategoryService;
  readonly #rules: RuleService;

  constructor(transactions: TransactionRepository, categories: CategoryService, rules: RuleService) {
    this.#transactions = transactions;
    this.#categories = categories;
    this.#rules = rules;
  }

  list(filters: TxFilters): TransactionsResult {
    const { items, matched } = this.#transactions.list(filters);
    return {
      items,
      matched,
      categories: this.#categories.list(),
      total: this.#transactions.countAll(filters.account),
      ...this.#transactions.dateBounds(filters.account),
    };
  }

  setComment(id: string, comment: string): string {
    const next = comment.trim().slice(0, 80);
    this.#transactions.setComment(id, next);
    return next;
  }

  setExcluded(id: string, excluded: boolean): void {
    this.#transactions.setExcluded(id, excluded);
  }

  /**
   * Sets the category of one payment. Without `onlyThis` it also creates/updates a rule for the payee,
   * so all past and future payments from them follow — except those marked `manualCategory`, unless `force`.
   */
  applyCategory(
    id: string,
    category: string,
    options: CategoryChangeOptions = {},
  ): { updated: number; skippedManual: number; pattern: string } {
    const target = category.trim() || DEFAULT_CATEGORY;
    this.#categories.ensure(target);
    const tx = this.#transactions.get(id);
    if (options.onlyThis) {
      this.#transactions.setCategory(id, target, options.manual !== false);
      return { updated: 1, skippedManual: 0, pattern: "" };
    }
    const pattern = merchantPattern(tx);
    if (pattern.length < 2) {
      this.#transactions.setCategory(id, target, false);
      return { updated: 1, skippedManual: 0, pattern: "" };
    }
    const force = Boolean(options.force);
    const skippedManual = force ? 0 : this.#transactions.countManualMatches(pattern, id);
    const { updated } = this.#rules.upsert(pattern, target, { force });
    this.#transactions.setCategory(id, target, false);
    return { updated: Math.max(updated, 1), skippedManual, pattern };
  }
}
