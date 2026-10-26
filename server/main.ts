// The local server (Windows / `npm run dev`): the data file, shutdown and the built frontend.
// All the app's logic runs in the browser; this only does what a browser cannot.
// The windowed app and Wydatki.cmd listen on 127.0.0.1. Wydatki.cmd opens the browser; the windowed app does not.
// A taken port: our other copy (browser mode) just opens the browser; anything else, including the windowed app, tries the next port (up to 10).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import { Runtime } from "./Runtime.ts";
import { readStore, writeStore } from "./store.ts";

/** `.env` keys the frontend uses as AI defaults. */
const AI_ENV = ["AI_PROVIDER", "AI_MODEL", "OPENAI_MODEL", "OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_BASE_URL"];

const runtime = new Runtime();
const app = express();
app.use(cors());
app.use(express.json({ limit: "64mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "wydatki" });
});

app.get("/api/app", (_req, res) => {
  const env = Object.fromEntries(AI_ENV.map((key) => [key, runtime.env(key)]).filter(([, value]) => value));
  res.json({ app: runtime.appInfo(), env });
});

app.get("/api/store", (_req, res) => {
  res.json(readStore(runtime.appRoot));
});

app.put("/api/store", (req, res) => {
  const store = req.body;
  if (!store || !Array.isArray(store.transactions) || !Array.isArray(store.accounts)) {
    res.status(400).json({ error: "Niekompletne dane." });
    return;
  }
  writeStore(runtime.appRoot, store);
  res.json({ ok: true });
});

if (runtime.desktop) {
  app.post("/api/shutdown", (_req, res) => {
    res.json({ ok: true });
    console.log("Zamknięto z aplikacji.");
    setTimeout(() => process.exit(0), 200);
  });
}

if (existsSync(runtime.dist)) {
  app.use(express.static(runtime.dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(runtime.dist, "index.html"));
  });
}

export function start(): Promise<number> {
  return listen(runtime.port, 10);
}

if (startedDirectly()) {
  void start().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

function startedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(resolve(entry)).href === import.meta.url;
}

function listen(port: number, attempts: number): Promise<number> {
  return new Promise((resolveReady, reject) => {
    const server = createServer(app);
    server.listen({ port, host: runtime.desktop ? "127.0.0.1" : undefined }, () => {
      const url = `http://127.0.0.1:${port}`;
      if (!runtime.desktop) console.log(`Wydatki API: ${url}`);
      else if (process.env.WYDATKI_NO_BROWSER === "1") console.log(`Wydatki: ${url}`);
      else {
        console.log(`Wydatki działa: ${url}`);
        console.log("Dane zapisują się w folderze „data” obok programu.");
        console.log("Żeby wyłączyć: „Zamknij aplikację” w menu po lewej albo zamknij to okno.");
        openBrowser(url);
      }
      resolveReady(port);
    });
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") {
        reject(error);
        return;
      }
      void portBusy(port, attempts, resolveReady, reject);
    });
  });
}

async function portBusy(port: number, attempts: number, resolveReady: (port: number) => void, reject: (error: unknown) => void): Promise<void> {
  if (runtime.desktop && attempts > 0) {
    if (process.env.WYDATKI_NO_BROWSER !== "1" && (await runningHere(port))) {
      console.log("Wydatki już działają — otwieram przeglądarkę.");
      openBrowser(`http://127.0.0.1:${port}`);
      setTimeout(() => process.exit(0), 500);
      return;
    }
    resolveReady(await listen(port + 1, attempts - 1));
    return;
  }
  const error = new Error(`Port ${port} jest zajęty. Zamknij inną instancję albo uruchom z PORT=${port + 1}.`);
  console.error(error.message);
  reject(error);
  process.exit(1);
}

function openBrowser(url: string): void {
  if (process.env.WYDATKI_NO_BROWSER === "1") return;
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function runningHere(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).app === "wydatki";
  } catch {
    return false;
  }
}
