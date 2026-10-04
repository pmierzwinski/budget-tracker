import type { Request, RequestHandler, Response } from "express";
import { TX_SORTS } from "../../shared/domain.ts";
import { parseDecimal } from "../../shared/numbers.ts";
import type { TxFilters, TxSort } from "../../shared/types.ts";

type Handler = (req: Request, res: Response) => unknown;

/**
 * Wraps a route: the returned value is sent as JSON, a thrown error becomes 400 `{ error }`
 * (its message, or `fallback` for non-Error throws). Validation = `throw new Error("Po polsku…")`.
 */
export function route(fallback: string, handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      const body = await handler(req, res);
      if (body !== undefined && !res.headersSent) res.json(body);
    } catch (error) {
      if (!res.headersSent) res.status(400).json({ error: error instanceof Error ? error.message : fallback });
    }
  };
}

/** `String(value || "")` — the lenient read used for body and query fields. */
export function text(value: unknown): string {
  return String(value || "");
}

/** Text as the user typed it, or undefined when empty. */
export function typed(value: unknown): string | undefined {
  return value == null || value === "" ? undefined : String(value);
}

export function readAccount(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Transaction filters from a query string or a JSON body. */
export function readFilters(source: Record<string, unknown> = {}): TxFilters {
  const sort = String(source.sort || "date_desc") as TxSort;
  const flag = (value: unknown) => value === "1" || value === true;
  return {
    from: typeof source.from === "string" && source.from ? source.from : undefined,
    to: typeof source.to === "string" && source.to ? source.to : undefined,
    category: typeof source.category === "string" ? source.category : undefined,
    q: typeof source.q === "string" ? source.q : undefined,
    minAmount: parseDecimal(source.minAmount),
    maxAmount: parseDecimal(source.maxAmount),
    kind: source.kind === "expense" || source.kind === "income" ? source.kind : "all",
    account: readAccount(source.account),
    includeExcluded: flag(source.includeExcluded),
    excludedOnly: flag(source.excludedOnly),
    weekday: parseDecimal(source.weekday),
    sort: TX_SORTS.includes(sort) ? sort : "date_desc",
  };
}
