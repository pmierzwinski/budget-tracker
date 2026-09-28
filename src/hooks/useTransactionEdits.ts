import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import { api } from "../api";
import type { CategoryScope } from "../components/CategorySelect";
import { errorMessage } from "../format";
import type { Transaction } from "../types";

export type TransactionChange =
  | { type: "category"; item: Transaction; category: string; scope: CategoryScope; updated: number; pattern: string }
  | { type: "comment"; item: Transaction; comment: string }
  | { type: "excluded"; item: Transaction; excluded: boolean };

/** Keeps "Inne" last when a new category shows up in a list. */
export function withCategory(names: string[], next: string): string[] {
  if (names.includes(next)) return names;
  return [...names.filter((name) => name !== DEFAULT_CATEGORY), next, DEFAULT_CATEGORY];
}

/**
 * Category / comment / hide edits on a list of payments: the edited row updates at once, then the API call
 * runs. A payee-wide category change also changes only that row in the list — the other rows from the payee
 * update on the next load, so nothing vanishes from a filtered list and the change can be reverted in place. After it succeeds `onSaved` runs
 * (refresh totals, show a message); when it fails `onFailed` gets the message — reload the list there.
 */
export function useTransactionEdits(options: {
  updateItems: (update: (items: Transaction[]) => Transaction[]) => void;
  addCategory?: (category: string) => void;
  onSaved?: (change: TransactionChange) => void | Promise<void>;
  onFailed: (message: string) => void | Promise<void>;
}) {
  const { updateItems, addCategory, onSaved, onFailed } = options;

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
    changeCategory(item: Transaction, category: string, scope: CategoryScope) {
      patch((row) => row.id === item.id, { category });
      addCategory?.(category);
      return save(async () => {
        const result = await api.updateCategory(item.id, category, { onlyThis: scope === "one" });
        return { type: "category", item, category, scope, updated: result.updated, pattern: result.pattern };
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
