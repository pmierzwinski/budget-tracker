// Categorization as a chain of matchers: user rules, built-in regexes, transfers; hidden categories end up in "Inne".
import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import type { CategoryRule } from "../../shared/types.ts";
import { BUILTIN_RULES } from "./builtinRules.ts";

export const LEGACY_SKIP_CATEGORY = "Poza statystykami";

export type RulePattern = Pick<CategoryRule, "pattern" | "category">;

export type Categorizable = { payee: string; title: string; description: string; type: string; amount: number };

export interface Categorizer {
  categorize(tx: Categorizable): string;
}

/** One link of the chain: a category, or null to let the next matcher try. */
export interface CategoryMatcher {
  match(text: string, amount: number): string | null;
}

/** User phrases (case-insensitive `includes`); the first matching rule wins. */
export class UserRuleMatcher implements CategoryMatcher {
  readonly #rules: RulePattern[];

  constructor(rules: RulePattern[]) {
    this.#rules = rules;
  }

  match(text: string): string | null {
    const haystack = text.toLowerCase();
    for (const rule of this.#rules) {
      const needle = rule.pattern.trim().toLowerCase();
      if (needle && haystack.includes(needle)) return rule.category;
    }
    return null;
  }
}

export class BuiltinRegexMatcher implements CategoryMatcher {
  match(text: string): string | null {
    for (const rule of BUILTIN_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(text))) return rule.category;
    }
    return null;
  }
}

/** Anything that looks like a transfer, and every incoming payment, is "Przelewy". */
export class TransferMatcher implements CategoryMatcher {
  match(text: string, amount: number): string | null {
    return /przelew|blik/i.test(text) || amount > 0 ? "Przelewy" : null;
  }
}

export class ChainCategorizer implements Categorizer {
  readonly #matchers: CategoryMatcher[];
  readonly #blocked: Set<string>;

  constructor(matchers: CategoryMatcher[], blocked: Iterable<string> = []) {
    this.#matchers = matchers;
    this.#blocked = new Set(blocked);
  }

  /** User rules first, then the built-in ones. */
  static withRules(rules: RulePattern[], blocked: Iterable<string> = []): ChainCategorizer {
    return new ChainCategorizer([new UserRuleMatcher(rules), new BuiltinRegexMatcher(), new TransferMatcher()], blocked);
  }

  static searchText(tx: Omit<Categorizable, "amount">): string {
    return [tx.payee, tx.title, tx.description, tx.type].filter(Boolean).join(" ");
  }

  categorize(tx: Categorizable): string {
    const text = ChainCategorizer.searchText(tx).replace(/\s+/g, " ");
    let category = DEFAULT_CATEGORY;
    for (const matcher of this.#matchers) {
      const next = matcher.match(text, tx.amount);
      if (next !== null) {
        category = next;
        break;
      }
    }
    return this.#blocked.has(category) ? DEFAULT_CATEGORY : category;
  }
}
