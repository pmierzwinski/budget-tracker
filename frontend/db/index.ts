import { BrowserDatabase } from "./BrowserDatabase";
import type { Database } from "./Database";
import { FileDatabase } from "./FileDatabase";

export { Database } from "./Database";

/** Web and Android keep the data in this browser; the computer keeps it in a file next to the app. */
export function openDatabase(): Database {
  const mode = import.meta.env.MODE;
  return mode === "web" || mode === "android" ? new BrowserDatabase() : new FileDatabase();
}
