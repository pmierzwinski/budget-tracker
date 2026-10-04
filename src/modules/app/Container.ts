// Composition root: builds every repository, service and controller once and wires them together.
import { Database } from "../core/Database.ts";
import type { Controller } from "../core/Controller.ts";
import { Runtime } from "../core/Runtime.ts";
import { SessionStore } from "../core/SessionStore.ts";
import { AccountRepository } from "../accounts/AccountRepository.ts";
import { AccountsController } from "../accounts/AccountsController.ts";
import { AccountService } from "../accounts/AccountService.ts";
import { accountsSchema } from "../accounts/schema.ts";
import { AiCategorizationService } from "../ai/AiCategorizationService.ts";
import { AiClient } from "../ai/AiClient.ts";
import { AiController } from "../ai/AiController.ts";
import { AiSettings } from "../ai/AiSettings.ts";
import { EvaluationRepository } from "../ai/EvaluationRepository.ts";
import { PeriodEvaluationService } from "../ai/PeriodEvaluationService.ts";
import { aiSchema } from "../ai/schema.ts";
import { BankingController } from "../banking/BankingController.ts";
import { BankingService } from "../banking/BankingService.ts";
import { EnableBankingProvider } from "../banking/EnableBankingProvider.ts";
import { GoCardlessProvider } from "../banking/GoCardlessProvider.ts";
import { BudgetService } from "../categories/BudgetService.ts";
import { CategoriesController } from "../categories/CategoriesController.ts";
import { CategoryRepository } from "../categories/CategoryRepository.ts";
import { CategoryService } from "../categories/CategoryService.ts";
import { LimitRepository } from "../categories/LimitRepository.ts";
import { RuleRepository } from "../categories/RuleRepository.ts";
import { RuleService } from "../categories/RuleService.ts";
import { categoriesSchema } from "../categories/schema.ts";
import { CsvStatementParser } from "../importer/csv/CsvStatementParser.ts";
import { DataResetService } from "../importer/DataResetService.ts";
import { DemoGenerator } from "../importer/demo/DemoGenerator.ts";
import { ImporterController } from "../importer/ImporterController.ts";
import { ImportService } from "../importer/ImportService.ts";
import { ChartSettingsService } from "../settings/ChartSettingsService.ts";
import { SettingsController } from "../settings/SettingsController.ts";
import { SettingsRepository } from "../settings/SettingsRepository.ts";
import { settingsSchema } from "../settings/schema.ts";
import { InsightsService, RecurringDetector } from "../statistics/InsightsService.ts";
import { RecurringOverrides } from "../statistics/RecurringOverrides.ts";
import { StatisticsController } from "../statistics/StatisticsController.ts";
import { StatsService } from "../statistics/StatsService.ts";
import { TransactionRepository } from "../transactions/TransactionRepository.ts";
import { TransactionsController } from "../transactions/TransactionsController.ts";
import { TransactionService } from "../transactions/TransactionService.ts";
import { transactionsSchema } from "../transactions/schema.ts";
import { AppController } from "./AppController.ts";
import { MetaService } from "./MetaService.ts";

export class Container {
  readonly runtime: Runtime;
  readonly database: Database;
  readonly sessions: SessionStore;
  readonly controllers: Controller[];

  constructor(runtime = new Runtime()) {
    this.runtime = runtime;
    const database = (this.database = new Database(runtime));
    this.sessions = new SessionStore(database);

    const settings = new SettingsRepository(database);
    const transactions = new TransactionRepository(database);
    const categoryRows = new CategoryRepository(database);
    const ruleRows = new RuleRepository(database);
    const limitRows = new LimitRepository(database);
    const accountRows = new AccountRepository(database);
    const evaluationRows = new EvaluationRepository(database);

    database.register(
      settingsSchema,
      transactionsSchema(database),
      categoriesSchema(database, ruleRows, categoryRows),
      accountsSchema(database),
      aiSchema,
    );

    const charts = new ChartSettingsService(settings);
    const categories = new CategoryService(database, categoryRows, ruleRows, limitRows);
    const rules = new RuleService(database, ruleRows, transactions, categories);
    const budgets = new BudgetService(limitRows);
    const edits = new TransactionService(transactions, categories, rules);
    const accounts = new AccountService(database, accountRows, transactions);

    const stats = new StatsService(transactions, categories, budgets, charts);
    const recurring = new RecurringOverrides(settings);
    const insights = new InsightsService(transactions, new RecurringDetector(transactions, recurring));

    const aiSettings = new AiSettings(settings, runtime);
    const ai = new AiClient(aiSettings);
    const categorization = new AiCategorizationService(ai, transactions, edits, categories, rules);
    const evaluations = new PeriodEvaluationService(ai, stats, insights, transactions, accounts, evaluationRows);

    const imports = new ImportService(new CsvStatementParser(), new DemoGenerator(), transactions, accounts, rules, categorization);
    const reset = new DataResetService({
      transactions,
      evaluations: evaluationRows,
      accounts: accountRows,
      rules: ruleRows,
      categories: categoryRows,
      limits: limitRows,
      settings,
      ruleService: rules,
    });

    const banking = new BankingService(
      new EnableBankingProvider(settings, runtime, accounts, rules),
      new GoCardlessProvider(settings, runtime, accounts, rules),
      accounts,
      transactions,
    );

    const meta = new MetaService({ runtime, transactions, categories, budgets, rules, accounts, ai: aiSettings, charts });

    this.controllers = [
      new AppController(meta),
      new TransactionsController(edits),
      new StatisticsController(stats, insights, recurring),
      new CategoriesController(categories, rules, budgets),
      new SettingsController(charts),
      new AccountsController(accounts),
      new ImporterController(imports, reset, this.sessions),
      new AiController(aiSettings, ai, categorization, evaluations, transactions, categories),
      new BankingController(banking, runtime),
    ];
  }
}
