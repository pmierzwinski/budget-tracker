// Compatibility barrel after the module move. Import from here so the schema is registered.
import "../schema.ts";

export { openDatabase, withDatabase } from "../platform/db.ts";
export * from "../modules/settings/store.ts";
export * from "../modules/categories/categories.ts";
export * from "../modules/categories/rules.ts";
export * from "../modules/accounts/accounts.ts";
export * from "../modules/transactions/repository.ts";
export * from "../modules/categories/limits.ts";
export * from "../modules/statistics/stats.ts";
export * from "../modules/statistics/insights.ts";
export * from "../modules/ai/evaluations.ts";
