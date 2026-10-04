import { randomUUID } from "node:crypto";
import { DEFAULT_CATEGORY } from "../../../shared/domain.ts";
import type { CategoryRule } from "../../../shared/types.ts";
import { rowToTx } from "../../db/rows.ts";
import { changes, db, transaction, type Row } from "../../platform/db.ts";
import { categorizer, type Categorizer } from "./categorizer.ts";
import { ensureCategory, hiddenCategoryNames, scrubHiddenCategories } from "./categories.ts";

type RuleRow = { id: string; pattern: string; category: string; created_at: string };

function rowToRule(row: RuleRow, category = row.category): CategoryRule {
  return { id: row.id, pattern: row.pattern, category, createdAt: row.created_at };
}

export function listRules(): CategoryRule[] {
  const rows = db
    .prepare("SELECT id, pattern, category, created_at FROM category_rules ORDER BY created_at DESC")
    .all() as RuleRow[];
  return rows.map((row) => rowToRule(row));
}

/** Categorizer with the current user rules and hidden categories; build once per batch. */
export function userCategorizer(): Categorizer {
  return categorizer(listRules(), hiddenCategoryNames());
}

export function upsertRule(
  pattern: string,
  category: string,
  options: { force?: boolean } = {},
): { rule: CategoryRule; updated: number } {
  const trimmed = pattern.trim();
  if (trimmed.length < 2) throw new Error("Fraza musi mieć co najmniej 2 znaki.");
  const target = category.trim() || DEFAULT_CATEGORY;
  ensureCategory(target);
  const existing = db
    .prepare("SELECT id, pattern, category, created_at FROM category_rules WHERE LOWER(pattern) = LOWER(?)")
    .get(trimmed) as RuleRow | undefined;

  let rule: CategoryRule;
  if (existing) {
    db.prepare("UPDATE category_rules SET category = ? WHERE id = ?").run(target, existing.id);
    rule = rowToRule(existing, target);
  } else {
    rule = { id: randomUUID(), pattern: trimmed, category: target, createdAt: new Date().toISOString() };
    db.prepare("INSERT INTO category_rules (id, pattern, category, created_at) VALUES (?, ?, ?, ?)").run(
      rule.id,
      rule.pattern,
      rule.category,
      rule.createdAt,
    );
  }
  return { rule, updated: applyRule(rule.pattern, rule.category, Boolean(options.force)) };
}

/** Deletes a rule and recategorizes everything, so its payments fall back to the remaining rules. */
export function deleteRule(id: string): void {
  db.prepare("DELETE FROM category_rules WHERE id = ?").run(id);
  recategorizeAll();
}

function applyRule(pattern: string, category: string, force = false): number {
  const like = `%${pattern}%`;
  const flag = force ? 1 : 0;
  return changes(
    db
      .prepare(
        `UPDATE transactions
         SET category = ?, manual_category = CASE WHEN ? = 1 THEN 0 ELSE manual_category END
         WHERE (payee LIKE ? OR title LIKE ? OR description LIKE ? OR type LIKE ?)
           AND (manual_category = 0 OR ? = 1)`,
      )
      .run(category, flag, like, like, like, like, flag),
  );
}

export function recategorizeAll(): number {
  const categorize = userCategorizer();
  const rows = db.prepare("SELECT * FROM transactions").all() as Row[];
  const update = db.prepare("UPDATE transactions SET category = ? WHERE id = ?");
  const changed = transaction(() => {
    let count = 0;
    for (const row of rows) {
      const tx = rowToTx(row);
      if (tx.manualCategory) continue;
      const next = categorize(tx);
      if (next !== tx.category) {
        update.run(next, tx.id);
        count += 1;
      }
    }
    return count;
  });
  scrubHiddenCategories();
  return changed;
}
