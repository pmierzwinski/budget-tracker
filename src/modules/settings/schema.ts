import type { ModuleSchema } from "../core/Database.ts";

export const settingsSchema: ModuleSchema = {
  tables: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `,
};
