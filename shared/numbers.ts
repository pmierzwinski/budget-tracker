export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Parses a user-typed number ("12,50" or 12.5); empty or invalid input gives undefined. */
export function parseDecimal(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isNaN(parsed) ? undefined : parsed;
}
