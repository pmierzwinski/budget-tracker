// How the server runs: paths, local / windowed (desktop) mode and .env.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppInfo } from "../shared/types.ts";

const nodeRequire = createRequire(import.meta.url);

export class Runtime {
  readonly packaged: boolean;
  /** One person on this computer: the windowed app or `Wydatki.cmd` (127.0.0.1). */
  readonly desktop: boolean;
  readonly appRoot: string;
  readonly port: number;
  readonly dist: string;

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
    this.dist = env.WYDATKI_DIST ? resolve(env.WYDATKI_DIST) : join(this.appRoot, "dist");
  }

  env(key: string): string {
    return process.env[key] || "";
  }

  appInfo(): AppInfo {
    return {
      mode: this.desktop ? "desktop" : "local",
      packaged: this.packaged,
      downloadUrl: "",
      showDownload: false,
      dataDir: join(this.appRoot, "data"),
    };
  }

  private static detectPackaged(): boolean {
    if (process.versions.electron) return true;
    try {
      const sea = nodeRequire("node:sea") as { isSea?: () => boolean };
      return Boolean(sea.isSea?.());
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
