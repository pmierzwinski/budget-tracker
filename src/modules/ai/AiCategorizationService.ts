import { DEFAULT_CATEGORY, merchantPattern } from "../shared/domain.ts";
import type { AiCategorizeResult, Transaction } from "../shared/types.ts";
import type { CategoryService } from "../categories/CategoryService.ts";
import type { RuleService } from "../categories/RuleService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import type { TransactionService } from "../transactions/TransactionService.ts";
import type { AiClient } from "./AiClient.ts";

type Assignment = { key: string; category: string };

type PayeeGroup = { key: string; sample: Transaction; count: number; ids: string[] };

const CHUNK_SIZE = 60;

/** Only payments in "Inne", grouped by payee; results are saved as rules so future imports need no AI. */
export class AiCategorizationService {
  readonly #ai: AiClient;
  readonly #transactions: TransactionRepository;
  readonly #edits: TransactionService;
  readonly #categories: CategoryService;
  readonly #rules: RuleService;

  constructor(
    ai: AiClient,
    transactions: TransactionRepository,
    edits: TransactionService,
    categories: CategoryService,
    rules: RuleService,
  ) {
    this.#ai = ai;
    this.#transactions = transactions;
    this.#edits = edits;
    this.#categories = categories;
    this.#rules = rules;
  }

  async categorize(ids?: string[]): Promise<AiCategorizeResult> {
    const items = this.#transactions.uncategorized(ids);
    if (!items.length) {
      return { updated: 0, groups: 0, remaining: 0 };
    }

    const categories = this.#categories.list();
    const groups = AiCategorizationService.#group(items);
    let updated = 0;

    for (let i = 0; i < groups.length; i += CHUNK_SIZE) {
      const chunk = groups.slice(i, i + CHUNK_SIZE);
      const assignments = await this.#ask(chunk, categories);
      const byKey = new Map(assignments.map((row) => [row.key, row.category]));
      for (const group of chunk) {
        const category = byKey.get(group.key);
        if (!category || category === DEFAULT_CATEGORY) continue;
        if (group.key.length >= 2) {
          updated += this.#rules.upsert(group.key, category).updated;
        } else {
          for (const id of group.ids) {
            updated += this.#edits.applyCategory(id, category, { onlyThis: true, manual: false }).updated;
          }
        }
      }
    }

    return {
      updated,
      groups: groups.length,
      remaining: this.#transactions.uncategorized().length,
    };
  }

  static #group(items: Transaction[]): PayeeGroup[] {
    const map = new Map<string, { sample: Transaction; ids: string[] }>();
    for (const item of items) {
      const key = merchantPattern(item).trim() || item.id;
      const current = map.get(key);
      if (current) current.ids.push(item.id);
      else map.set(key, { sample: item, ids: [item.id] });
    }
    return [...map.entries()].map(([key, value]) => ({
      key,
      sample: value.sample,
      count: value.ids.length,
      ids: value.ids,
    }));
  }

  async #ask(groups: PayeeGroup[], categories: string[]): Promise<Assignment[]> {
    const payload = groups.map((group) => ({
      key: group.key,
      count: group.count,
      payee: group.sample.payee,
      title: group.sample.title,
      type: group.sample.type,
      amount: group.sample.amount,
    }));
    const parsed = (await this.#ai.chatJson(
      "Jesteś asystentem do kategoryzacji wydatków z polskiego konta bankowego. " +
        "Przypisuj kategorie wyłącznie z podanej listy. Jeśli nie jesteś pewien, użyj „Inne”. " +
        'Zwróć JSON: {"assignments":[{"key":"...","category":"..."}]}',
      `Dostępne kategorie:\n${categories.join(", ")}\n\nPłatności (pogrupowane po pośredniku):\n${JSON.stringify(payload)}`,
      0,
    )) as { assignments?: Assignment[] };
    const allowed = new Set(categories);
    return (parsed.assignments || []).filter((row) => row.key && row.category && allowed.has(row.category));
  }
}
