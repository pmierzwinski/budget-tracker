import { Repository } from "../core/Repository.ts";

/** Custom category names and built-in ones the user removed or renamed ("hidden"). */
export class CategoryRepository extends Repository {
  hiddenNames(): Set<string> {
    return new Set(this.all<{ name: string }>("SELECT name FROM hidden_categories").map((row) => row.name));
  }

  customNames(): string[] {
    return this.all<{ name: string }>("SELECT name FROM custom_categories ORDER BY name").map((row) => row.name);
  }

  /** Categories that payments currently sit in. */
  usedNames(): string[] {
    return this.all<{ category: string }>("SELECT DISTINCT category FROM transactions").map((row) => row.category);
  }

  addCustom(name: string): void {
    this.run("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)", name);
  }

  removeCustom(name: string): void {
    this.run("DELETE FROM custom_categories WHERE name = ?", name);
  }

  hide(name: string): void {
    this.run("INSERT OR IGNORE INTO hidden_categories (name) VALUES (?)", name);
  }

  unhide(name: string): void {
    this.run("DELETE FROM hidden_categories WHERE name = ?", name);
  }

  /** Moves payments from one category to another; returns how many moved. */
  movePayments(source: string, target: string): number {
    return this.run("UPDATE transactions SET category = ? WHERE category = ?", target, source);
  }

  /** Payments still sitting in a hidden category go to `fallback`. */
  movePaymentsOutOfHidden(fallback: string): void {
    this.run("UPDATE transactions SET category = ? WHERE category IN (SELECT name FROM hidden_categories)", fallback);
  }

  clear(): void {
    this.exec("DELETE FROM custom_categories; DELETE FROM hidden_categories;");
  }
}
