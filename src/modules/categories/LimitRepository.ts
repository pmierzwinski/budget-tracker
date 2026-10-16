import type { CategoryLimitSetting } from "../shared/types.ts";
import { Repository } from "../core/Repository.ts";

export class LimitRepository extends Repository {
  list(): CategoryLimitSetting[] {
    return this.all<{ category: string; monthly_limit: number }>(
      "SELECT category, monthly_limit FROM category_limits ORDER BY category",
    )
      .filter((row) => row.monthly_limit > 0)
      .map((row) => ({ category: row.category, monthlyLimit: Number(row.monthly_limit) }));
  }

  set(category: string, monthlyLimit: number): void {
    this.run(
      `INSERT INTO category_limits (category, monthly_limit) VALUES (?, ?)
       ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
      category,
      monthlyLimit,
    );
  }

  delete(category: string): void {
    this.run("DELETE FROM category_limits WHERE category = ?", category);
  }

  /** The limit of `source` replaces the one of `target`. */
  move(source: string, target: string): void {
    this.delete(target);
    this.run("UPDATE category_limits SET category = ? WHERE category = ?", target, source);
  }

  clear(): void {
    this.exec("DELETE FROM category_limits;");
  }
}
