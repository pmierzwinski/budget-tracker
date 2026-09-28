// The database layer. Import from here (not from the files directly) — this also registers the schema.
// Layers, lowest first: core → settings → categories → rules → accounts / transactions → limits → stats, insights.
import "./schema.ts";

export { openDatabase, withDatabase } from "./core.ts";
export * from "./settings.ts";
export * from "./categories.ts";
export * from "./rules.ts";
export * from "./accounts.ts";
export * from "./transactions.ts";
export * from "./limits.ts";
export * from "./stats.ts";
export * from "./insights.ts";
export * from "./evaluations.ts";
