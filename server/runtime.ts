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

export function serverEnv(key: string): string {
  return hosted ? "" : process.env[key] || "";
}
