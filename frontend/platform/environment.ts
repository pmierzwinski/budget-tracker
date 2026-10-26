import { RELEASE_DOWNLOAD_URL } from "../../shared/domain";
import type { AppInfo } from "../../shared/types";

/** Where the app runs plus the AI defaults from `.env` (only the computer version has a server and `.env`). */
export type Environment = { app: AppInfo; env: Record<string, string> };

export async function loadEnvironment(): Promise<Environment> {
  const mode = import.meta.env.MODE;
  if (mode === "web" || mode === "android") {
    return { app: { mode, packaged: false, downloadUrl: RELEASE_DOWNLOAD_URL, showDownload: mode === "web" }, env: {} };
  }
  const response = await fetch("/api/app");
  if (!response.ok) throw new Error("Nie udało się połączyć z aplikacją.");
  return (await response.json()) as Environment;
}
