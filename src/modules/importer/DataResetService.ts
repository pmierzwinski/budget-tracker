import type { AccountRepository } from "../accounts/AccountRepository.ts";
import type { EvaluationRepository } from "../ai/EvaluationRepository.ts";
import type { CategoryRepository } from "../categories/CategoryRepository.ts";
import type { LimitRepository } from "../categories/LimitRepository.ts";
import type { RuleRepository } from "../categories/RuleRepository.ts";
import type { RuleService } from "../categories/RuleService.ts";
import type { SettingsRepository } from "../settings/SettingsRepository.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";

/** Clearing payments, the full reset and recomputing categories. */
export class DataResetService {
  readonly #transactions: TransactionRepository;
  readonly #evaluations: EvaluationRepository;
  readonly #accounts: AccountRepository;
  readonly #rules: RuleRepository;
  readonly #categories: CategoryRepository;
  readonly #limits: LimitRepository;
  readonly #settings: SettingsRepository;
  readonly #ruleService: RuleService;

  constructor(deps: {
    transactions: TransactionRepository;
    evaluations: EvaluationRepository;
    accounts: AccountRepository;
    rules: RuleRepository;
    categories: CategoryRepository;
    limits: LimitRepository;
    settings: SettingsRepository;
    ruleService: RuleService;
  }) {
    this.#transactions = deps.transactions;
    this.#evaluations = deps.evaluations;
    this.#accounts = deps.accounts;
    this.#rules = deps.rules;
    this.#categories = deps.categories;
    this.#limits = deps.limits;
    this.#settings = deps.settings;
    this.#ruleService = deps.ruleService;
  }

  /** Payments and saved evaluations; accounts, categories and rules stay. */
  clearPayments(): void {
    this.#transactions.clear();
    this.#evaluations.clear();
  }

  /** Everything the user created; built-in categories come back, pasted API keys stay. */
  resetAll(): void {
    this.clearPayments();
    this.#accounts.clear();
    this.#rules.clear();
    this.#categories.clear();
    this.#limits.clear();
    this.#settings.resetUserSettings();
  }

  /** Drops demo payments and runs the categorizer over everything again. */
  recategorize(): { changed: number; minDate: string; maxDate: string; total: number } {
    this.#transactions.deleteDemo();
    const changed = this.#ruleService.recategorizeAll();
    return { changed, ...this.#transactions.dateBounds(), total: this.#transactions.countAll() };
  }
}
