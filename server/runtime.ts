import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isSea } from "node:sea";
import { fileURLToPath } from "node:url";

function detectPackaged(): boolean {
  try {
    return isSea();
  } catch {
    return false;
  }
}

export const packaged = detectPackaged();

export const appRoot = process.env.WYDATKI_ROOT
  ? resolve(process.env.WYDATKI_ROOT)
  : packaged
    ? dirname(process.execPath)
    : join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(): void {
  const envPath = join(appRoot, ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

export const hosted = process.env.HOSTED === "1";

/** Server-side secrets from .env — ignored in hosted mode, where every visitor brings their own. */
export function serverEnv(key: string): string {
  return hosted ? "" : process.env[key] || "";
}

export const port = Number(process.env.PORT || 8787);
export const dist = join(appRoot, "dist");
export const releaseDir = join(appRoot, "release");
export const DOWNLOAD_FILE = "Wydatki-Windows.zip";

/** Where the frontend lives: the API itself when dist/ is built, otherwise the Vite dev server. */
export const publicUrl = (
  process.env.PUBLIC_URL || (existsSync(dist) ? `http://localhost:${port}` : "http://localhost:5173")
).replace(/\/$/, "");

/** Where the API is reachable from the browser (bank redirects come back here). */
export const apiUrl = (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, "");

/** The frontend that made the request (localhost on any port, or PUBLIC_URL); falls back to publicUrl. */
export function frontendUrl(origin: string): string {
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === publicUrl;
  return allowed ? origin.replace(/\/$/, "") : publicUrl;
}

export function downloadUrl(): string {
  if (packaged) return "";
  if (process.env.DOWNLOAD_URL) return process.env.DOWNLOAD_URL;
  return existsSync(join(releaseDir, DOWNLOAD_FILE)) ? `/download/${DOWNLOAD_FILE}` : "";
}
