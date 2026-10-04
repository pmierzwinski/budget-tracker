import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import type { Database, Migration, ModuleSchema } from "../core/Database.ts";
import { TransactionRepository } from "../transactions/TransactionRepository.ts";
import { ChainCategorizer, LEGACY_SKIP_CATEGORY } from "./categorizer/Categorizer.ts";
import type { CategoryRepository } from "./CategoryRepository.ts";
import type { RuleRepository } from "./RuleRepository.ts";

const TABLES = `
  CREATE TABLE IF NOT EXISTS custom_categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS category_rules (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS hidden_categories (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS category_limits (
    category TEXT PRIMARY KEY,
    monthly_limit REAL NOT NULL
  );
`;

/** The old "Poza statystykami" category became the `excluded` flag; those payments get a real category. */
class SkipFlagMigration implements Migration {
  readonly key = "migration.skip_flag";
  readonly #database: Database;
  readonly #rules: RuleRepository;
  readonly #categories: CategoryRepository;

  constructor(database: Database, rules: RuleRepository, categories: CategoryRepository) {
    this.#database = database;
    this.#rules = rules;
    this.#categories = categories;
  }

  run(): void {
    const db = this.#database.connection;
    const categorizer = ChainCategorizer.withRules(
      this.#rules.list().filter((rule) => rule.category !== LEGACY_SKIP_CATEGORY),
      [...this.#categories.hiddenNames(), LEGACY_SKIP_CATEGORY],
    );
    const rows = db.prepare("SELECT * FROM transactions WHERE category = ?").all(LEGACY_SKIP_CATEGORY);
    const update = db.prepare("UPDATE transactions SET excluded = 1, category = ? WHERE id = ?");
    for (const row of rows) {
      const tx = TransactionRepository.fromRow(row);
      update.run(categorizer.categorize(tx), tx.id);
    }
    db.prepare("UPDATE category_rules SET category = ? WHERE category = ?").run(DEFAULT_CATEGORY, LEGACY_SKIP_CATEGORY);
    db.prepare("DELETE FROM category_limits WHERE category = ?").run(LEGACY_SKIP_CATEGORY);
    db.prepare("DELETE FROM custom_categories WHERE name = ?").run(LEGACY_SKIP_CATEGORY);
  }
}

export function categoriesSchema(database: Database, rules: RuleRepository, categories: CategoryRepository): ModuleSchema {
  return { tables: TABLES, migrations: [new SkipFlagMigration(database, rules, categories)] };
}
