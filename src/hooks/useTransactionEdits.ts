import { DEFAULT_CATEGORY, merchantPattern } from "../../shared/domain.ts";
import { api } from "../api";
import { useApp } from "../app/AppContext";
import type { CategoryChangeOptions, CategoryScope } from "../components/CategorySelect";
import { errorMessage, plural } from "../format";
import type { Transaction } from "../types";

export type TransactionChange =
  | {
      type: "category";
      item: Transaction;
      category: string;
      scope: CategoryScope;
      updated: number;
      skippedManual: number;
      pattern: string;
    }
  | { type: "comment"; item: Transaction; comment: string }
  | { type: "excluded"; item: Transaction; excluded: boolean };

/** Keeps "Inne" last when a new category shows up in a list. */
export function withCategory(names: string[], next: string): string[] {
  if (names.includes(next)) return names;
  return [...names.filter((name) => name !== DEFAULT_CATEGORY), next, DEFAULT_CATEGORY];
}

function matchesRule(row: Transaction, pattern: string): boolean {
  const needle = pattern.toLowerCase();
  return [row.payee, row.title, row.description, row.type].some((text) => text.toLowerCase().includes(needle));
}

/**
 * Category / comment / hide edits update rows in place and keep them on a filtered list so the change
 * can be reverted. A filter click / period change reloads and drops rows that no longer match.
 */
export function useTransactionEdits(options: {
  updateItems: (update: (items: Transaction[]) => Transaction[]) => void;
  addCategory?: (category: string) => void;
  onSaved?: (change: TransactionChange) => void | Promise<void>;
  onFailed: (message: string) => void | Promise<void>;
}) {
  const { updateItems, addCategory, onSaved, onFailed } = options;
  const { notify } = useApp();

  function patch(match: (row: Transaction) => boolean, fields: Partial<Transaction>) {
    updateItems((items) => items.map((row) => (match(row) ? { ...row, ...fields } : row)));
  }

  async function save(action: () => Promise<TransactionChange>, fallback: string) {
    try {
      await onSaved?.(await action());
    } catch (err) {
      await onFailed(errorMessage(err, fallback));
    }
  }

  return {
    changeCategory(item: Transaction, category: string, scope: CategoryScope, extras?: CategoryChangeOptions) {
      const force = extras?.force === true;
      addCategory?.(category);
      if (scope === "one") {
        patch((row) => row.id === item.id, { category, manualCategory: true });
      } else {
        const pattern = merchantPattern(item);
        updateItems((items) =>
          items.map((row) => {
            if (row.id === item.id) return { ...row, category, manualCategory: false };
            if (!force && row.manualCategory) return row;
            if (pattern.length >= 2 && !matchesRule(row, pattern)) return row;
            if (pattern.length < 2 && row.id !== item.id) return row;
            return { ...row, category, manualCategory: false };
          }),
        );
      }
      return save(async () => {
        const result = await api.updateCategory(item.id, category, { onlyThis: scope === "one", force });
        if (scope === "merchant") {
          const who = result.pattern || item.payee || item.title || "tego odbiorcy";
          const skipped = result.skippedManual
            ? ` Pominięto ${result.skippedManual} ${plural(
                result.skippedManual,
                "płatność ustawioną ręcznie",
                "płatności ustawione ręcznie",
                "płatności ustawionych ręcznie",
              )}.`
            : "";
          notify({
            type: "category_changed",
            title: `Zmieniono ${result.updated} ${plural(result.updated, "płatność", "płatności", "płatności")}`,
            body: `Kategoria „${category}” dla płatności od „${who}”.${skipped}`,
            page: "transactions",
            q: item.payee || item.title || "",
          });
        }
        return {
          type: "category",
          item,
          category,
          scope,
          updated: result.updated,
          skippedManual: result.skippedManual,
          pattern: result.pattern,
        };
      }, "Nie zapisano kategorii");
    },
    changeComment(item: Transaction, comment: string) {
      patch((row) => row.id === item.id, { comment });
      return save(async () => {
        await api.updateComment(item.id, comment);
        return { type: "comment", item, comment };
      }, "Nie zapisano komentarza");
    },
    changeExcluded(item: Transaction, excluded: boolean) {
      patch((row) => row.id === item.id, { excluded });
      return save(async () => {
        await api.setExcluded(item.id, excluded);
        return { type: "excluded", item, excluded };
      }, "Nie zapisano zmiany");
    },
  };
}
