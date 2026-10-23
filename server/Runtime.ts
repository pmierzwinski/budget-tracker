// How the server runs: paths, local / packaged (desktop) mode, .env and public URLs.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isSea } from "node:sea";
import { fileURLToPath } from "node:url";
import type { AppInfo } from "../shared/types.ts";
import { DOWNLOAD_FILE, RELEASE_DOWNLOAD_URL } from "../shared/domain.ts";

export class Runtime {
  readonly packaged: boolean;
  /** Started for one person on this computer: the exe or `Wydatki.cmd` (127.0.0.1, opens the browser). */
  readonly desktop: boolean;
  readonly appRoot: string;
  readonly port: number;
  readonly dist: string;
  readonly releaseDir: string;
  /** Where the frontend lives: the API itself when dist/ is built, otherwise the Vite dev server. */
  readonly publicUrl: string;
  /** Where the API is reachable from the browser (bank redirects come back here). */
  readonly apiUrl: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.packaged = Runtime.detectPackaged();
    this.desktop = this.packaged || env.WYDATKI_DESKTOP === "1";
    this.appRoot = env.WYDATKI_ROOT
      ? resolve(env.WYDATKI_ROOT)
      : this.packaged
        ? dirname(process.execPath)
        : join(dirname(fileURLToPath(import.meta.url)), "..");
    Runtime.loadEnvFile(join(this.appRoot, ".env"), env);
    this.port = Number(env.PORT || 8787);
    this.dist = join(this.appRoot, "dist");
    this.releaseDir = join(this.appRoot, "release");
    this.publicUrl = (env.PUBLIC_URL || (existsSync(this.dist) ? `http://localhost:${this.port}` : "http://localhost:5173")).replace(
      /\/$/,
      "",
    );
    this.apiUrl = (env.PUBLIC_URL || `http://localhost:${this.port}`).replace(/\/$/, "");
  }

  env(key: string): string {
    return process.env[key] || "";
  }

  appInfo(): AppInfo {
    return { mode: this.desktop ? "desktop" : "local", packaged: this.packaged, downloadUrl: this.downloadUrl() };
  }

  /** The frontend that made the request (localhost on any port, or PUBLIC_URL); falls back to publicUrl. */
  frontendUrl(origin: string): string {
    const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === this.publicUrl;
    return allowed ? origin.replace(/\/$/, "") : this.publicUrl;
  }

  /** DOWNLOAD_URL, a local build or the GitHub release. The frontend shows it only in the showcase mode. */
  downloadUrl(): string {
    if (process.env.DOWNLOAD_URL) return process.env.DOWNLOAD_URL;
    return existsSync(join(this.releaseDir, DOWNLOAD_FILE)) ? `/download/${DOWNLOAD_FILE}` : RELEASE_DOWNLOAD_URL;
  }

  private static detectPackaged(): boolean {
    try {
      return isSea();
    } catch {
      return false;
    }
  }

  private static loadEnvFile(path: string, env: NodeJS.ProcessEnv): void {
    if (!existsSync(path)) return;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!env[key]) env[key] = value;
    }
  }
}
