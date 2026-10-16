// What services need to know about where the app runs, without Node: the server's Runtime implements it,
// and so does the web version (data only in the browser, no .env).
import type { AppInfo } from "../shared/types.ts";

export const DOWNLOAD_FILE = "Wydatki-Windows.zip";
export const RELEASE_DOWNLOAD_URL = `https://github.com/pmierzwinski/budget-tracker/releases/latest/download/${DOWNLOAD_FILE}`;

export interface AppEnvironment {
  appInfo(): AppInfo;
  /** Server-side secret from .env; "" when there is none (always in the web version). */
  env(key: string): string;
}
