// The web and Android versions' "server": the shared Modules on the browser database, answering src/api.ts with a real
// Response. Every successful change is saved to IndexedDB. Only AI requests leave the browser (to the provider
// the user configured with their own key).
import type { Router } from "express";
import { Modules } from "../modules/app/Modules.ts";
import { RELEASE_DOWNLOAD_URL, type AppEnvironment } from "../modules/core/AppEnvironment.ts";
import { Database } from "../modules/core/Database.ts";
import { BrowserDatabase } from "./browserDatabase";
import { LocalRouter } from "./LocalRouter";

const environment: AppEnvironment = {
  appInfo: () => ({
    mode: import.meta.env.MODE === "android" ? "android" : "web",
    packaged: false,
    downloadUrl: RELEASE_DOWNLOAD_URL,
  }),
  env: () => "",
};

type Server = { router: LocalRouter; storage: BrowserDatabase };

let starting: Promise<Server> | null = null;

async function start(): Promise<Server> {
  const storage = await BrowserDatabase.open();
  const modules = new Modules(new Database(() => storage.connection), environment, (_req, _res, next) => next());
  const router = new LocalRouter();
  for (const controller of modules.controllers) controller.register(router as unknown as Router);
  return { router, storage };
}

export async function localFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { router, storage } = await (starting ??= start());
  const url = new URL(path, location.href);
  const method = (init.method || "GET").toUpperCase();
  const { body, file } = await readBody(init.body);
  const res = await router.dispatch({
    method,
    path: url.pathname.replace(/^\/api/, ""),
    query: Object.fromEntries(url.searchParams),
    body,
    file,
  });
  if (method !== "GET" && res.statusCode < 400) await storage.save();
  return new Response(JSON.stringify(res.body ?? {}), {
    status: res.statusCode,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(raw: RequestInit["body"]): Promise<{ body: Record<string, unknown>; file?: { buffer: Uint8Array } }> {
  if (typeof raw === "string") return { body: JSON.parse(raw) as Record<string, unknown> };
  if (!(raw instanceof FormData)) return { body: {} };
  const body: Record<string, unknown> = {};
  let file: { buffer: Uint8Array } | undefined;
  for (const [key, value] of raw) {
    if (typeof value === "string") body[key] = value;
    else if (key === "file") file = { buffer: new Uint8Array(await value.arrayBuffer()) };
  }
  return { body, file };
}
