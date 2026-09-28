import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { NextFunction, Request, Response } from "express";
import { openDatabase, withDatabase } from "./db.ts";

const COOKIE = "wydatki_sid";
const IDLE_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = Number(process.env.HOSTED_MAX_SESSIONS || 500);

type Session = { db: DatabaseSync; seen: number };

const sessions = new Map<string, Session>();

function readCookie(header: string | undefined, name: string): string {
  for (const part of (header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sweep(now: number) {
  for (const [id, session] of sessions) {
    if (now - session.seen > IDLE_MS) {
      session.db.close();
      sessions.delete(id);
    }
  }
  while (sessions.size >= MAX_SESSIONS) {
    let oldest: [string, Session] | null = null;
    for (const entry of sessions) if (!oldest || entry[1].seen < oldest[1].seen) oldest = entry;
    if (!oldest) break;
    oldest[1].db.close();
    sessions.delete(oldest[0]);
  }
}

setInterval(() => sweep(Date.now()), 10 * 60 * 1000).unref();

export function sessionScope(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  let id = readCookie(req.headers.cookie, COOKIE);
  let session = id ? sessions.get(id) : undefined;
  if (!session) {
    sweep(now);
    id = randomUUID();
    session = { db: openDatabase(), seen: now };
    sessions.set(id, session);
    const secure = req.secure ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${IDLE_MS / 1000}${secure}`,
    );
  }
  session.seen = now;
  res.locals.db = session.db;
  withDatabase(session.db, () => next());
}

export function reenterSession(_req: Request, res: Response, next: NextFunction) {
  const db = res.locals.db as DatabaseSync | undefined;
  if (db) withDatabase(db, () => next());
  else next();
}

export function sessionCount(): number {
  return sessions.size;
}
