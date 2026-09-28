/** JSON request to a bank-data provider; errors carry the provider name, status and its message. */
export async function providerFetch(
  provider: string,
  url: string,
  init: RequestInit,
  errorDetail: (body: Record<string, unknown> | null) => unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const body = typeof data === "object" && data ? (data as Record<string, unknown>) : null;
    const detail = errorDetail(body) || text.slice(0, 300);
    throw new Error(`${provider} ${response.status}: ${detail}`);
  }
  return data;
}

export function sortInstitutions<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name, "pl"));
}
