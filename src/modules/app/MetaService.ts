import type { Meta } from "../shared/types.ts";
import type { Runtime } from "../core/Runtime.ts";
import type { AccountService } from "../accounts/AccountService.ts";
import type { AiSettings } from "../ai/AiSettings.ts";
import type { BudgetService } from "../categories/BudgetService.ts";
import type { CategoryService } from "../categories/CategoryService.ts";
import type { RuleService } from "../categories/RuleService.ts";
import { BANKS } from "../importer/csv/banks.ts";
import type { ChartSettingsService } from "../settings/ChartSettingsService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";

export type MetaDeps = {
  runtime: Runtime;
  transactions: TransactionRepository;
  categories: CategoryService;
  budgets: BudgetService;
  rules: RuleService;
  accounts: AccountService;
  ai: AiSettings;
  charts: ChartSettingsService;
};

/** Everything a page needs up front (`GET /meta`): date range, counters, categories, accounts, app mode. */
export class MetaService {
  readonly #deps: MetaDeps;

  constructor(deps: MetaDeps) {
    this.#deps = deps;
  }

  meta(account?: string): Meta {
    const { runtime, transactions, categories, budgets, rules, accounts, ai, charts } = this.#deps;
    return {
      ...transactions.dateBounds(account),
      total: transactions.countAll(account),
      uncategorized: transactions.countUncategorized(account),
      excluded: transactions.countExcluded(account),
      categories: categories.list(),
      limits: budgets.list(),
      rules: rules.list(),
      hasAiKey: ai.hasKey(),
      ai: ai.publicInfo(),
      accounts: accounts.list(),
      banks: [...BANKS],
      amountThresholds: charts.amountThresholds(),
      app: { hosted: runtime.hosted, packaged: runtime.packaged, downloadUrl: runtime.downloadUrl() },
    };
  }
}
