import type { Store } from "../../shared/store";
import type { Meta } from "../../shared/types";
import { listAccounts } from "../modules/accounts";
import { aiConfig, aiPublic } from "../modules/ai";
import { listCategories, listLimits, listRules } from "../modules/categories";
import { BANKS } from "../modules/import";
import { dateBounds, isUncategorized, ofAccount } from "../modules/payments";
import { amountThresholds } from "../modules/statistics";
import type { Environment } from "../platform";

/** Everything pages need up front: date range, counters, categories, accounts, app mode. */
export function computeMeta(store: Store, account: string, { app, env }: Environment): Meta {
  const transactions = ofAccount(store.transactions, account);
  return {
    ...dateBounds(transactions),
    total: transactions.length,
    uncategorized: transactions.filter(isUncategorized).length,
    excluded: transactions.filter((tx) => tx.excluded).length,
    categories: listCategories(store),
    limits: listLimits(store),
    rules: listRules(store),
    hasAiKey: Boolean(aiConfig(store, env).apiKey),
    ai: aiPublic(store, env),
    accounts: listAccounts(store),
    banks: [...BANKS],
    amountThresholds: amountThresholds(store),
    app,
  };
}
