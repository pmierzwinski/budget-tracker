import type { DependencyList } from "react";
import type { TransactionsResult } from "../types";
import { useAsync } from "./useAsync";
import { withCategory } from "./useTransactionEdits";

/** A loaded list of payments plus the updaters useTransactionEdits needs for optimistic changes. */
export function useTransactionList(load: () => Promise<TransactionsResult> | null, deps: DependencyList, delay = 0) {
  const list = useAsync(load, deps, delay);
  return {
    ...list,
    items: list.data?.items || [],
    categories: list.data?.categories || [],
    updateItems: (update: (items: TransactionsResult["items"]) => TransactionsResult["items"]) =>
      list.setData((data) => data && { ...data, items: update(data.items) }),
    addCategory: (category: string) =>
      list.setData((data) => data && { ...data, categories: withCategory(data.categories, category) }),
  };
}
