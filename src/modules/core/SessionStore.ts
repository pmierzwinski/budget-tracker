// Hosted mode: a cookie per visitor → their own in-memory database (24 h idle, oldest dropped over the cap).
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Database } from "./Database.ts";

type Session = { db: DatabaseSync; seen: number };

const COOKIE = "wydatki_sid";
const IDLE_MS = 24 * 60 * 60 * 1000;

export class SessionStore {
  readonly #sessions = new Map<string, Session>();
  readonly #database: Database;
  readonly #maxSessions: number;

  constructor(database: Database, maxSessions = Number(process.env.HOSTED_MAX_SESSIONS || 500)) {
    this.#database = database;
    this.#maxSessions = maxSessions;
    setInterval(() => this.#sweep(Date.now()), 10 * 60 * 1000).unref();
  }

  get size(): number {
    return this.#sessions.size;
  }

  /** Middleware: runs the rest of the request inside the visitor's database. */
  readonly scope: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    let id = SessionStore.readCookie(req.headers.cookie, COOKIE);
    let session = id ? this.#sessions.get(id) : undefined;
    if (!session) {
      this.#sweep(now);
      id = randomUUID();
      session = { db: this.#database.open(), seen: now };
      this.#sessions.set(id, session);
      const secure = req.secure ? "; Secure" : "";
      res.setHeader("Set-Cookie", `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${IDLE_MS / 1000}${secure}`);
    }
    session.seen = now;
    res.locals.db = session.db;
    this.#database.within(session.db, () => next());
  };

  /** multer loses the async context, so routes with an upload re-enter the session database after it. */
  readonly reenter: RequestHandler = (_req: Request, res: Response, next: NextFunction) => {
    const db = res.locals.db as DatabaseSync | undefined;
    if (db) this.#database.within(db, () => next());
    else next();
  };

  #sweep(now: number): void {
    for (const [id, session] of this.#sessions) {
      if (now - session.seen > IDLE_MS) this.#drop(id, session);
    }
    while (this.#sessions.size >= this.#maxSessions) {
      let oldest: [string, Session] | null = null;
      for (const entry of this.#sessions) if (!oldest || entry[1].seen < oldest[1].seen) oldest = entry;
      if (!oldest) break;
      this.#drop(...oldest);
    }
  }

  #drop(id: string, session: Session): void {
    session.db.close();
    this.#sessions.delete(id);
  }

  private static readCookie(header: string | undefined, name: string): string {
    for (const part of (header || "").split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return decodeURIComponent(rest.join("="));
    }
    return "";
  }
}
