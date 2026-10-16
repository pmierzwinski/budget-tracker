import type { CategoryRule } from "../shared/types.ts";
import { Repository } from "../core/Repository.ts";

type RuleRow = { id: string; pattern: string; category: string; created_at: string };

export class RuleRepository extends Repository {
  list(): CategoryRule[] {
    return this.all<RuleRow>("SELECT id, pattern, category, created_at FROM category_rules ORDER BY created_at DESC").map((row) =>
      RuleRepository.toRule(row),
    );
  }

  findByPattern(pattern: string): CategoryRule | undefined {
    const row = this.one<RuleRow>(
      "SELECT id, pattern, category, created_at FROM category_rules WHERE LOWER(pattern) = LOWER(?)",
      pattern,
    );
    return row ? RuleRepository.toRule(row) : undefined;
  }

  insert(rule: CategoryRule): void {
    this.run(
      "INSERT INTO category_rules (id, pattern, category, created_at) VALUES (?, ?, ?, ?)",
      rule.id,
      rule.pattern,
      rule.category,
      rule.createdAt,
    );
  }

  setCategory(id: string, category: string): void {
    this.run("UPDATE category_rules SET category = ? WHERE id = ?", category, id);
  }

  moveCategory(source: string, target: string): void {
    this.run("UPDATE category_rules SET category = ? WHERE category = ?", target, source);
  }

  delete(id: string): void {
    this.run("DELETE FROM category_rules WHERE id = ?", id);
  }

  clear(): void {
    this.exec("DELETE FROM category_rules;");
  }

  private static toRule(row: RuleRow): CategoryRule {
    return { id: row.id, pattern: row.pattern, category: row.category, createdAt: row.created_at };
  }
}
