import type { ModuleSchema } from "../core/Database.ts";

export const aiSchema: ModuleSchema = {
  tables: `
    CREATE TABLE IF NOT EXISTS period_evaluations (
      scope TEXT PRIMARY KEY,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      label TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `,
};
