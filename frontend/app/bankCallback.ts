// Return from the bank's login page: the server redirects to /?bank=connected|error (see server/bank/routes.ts).

export type BankCallback = { provider: "gocardless" | "enablebanking" | null; error: string } | null;

/** True while the URL still has ?bank= from the bank's redirect (does not consume it). */
export function hasBankReturn(): boolean {
  return new URLSearchParams(window.location.search).has("bank");
}

/** Reads (and clears) ?bank=connected|error from the URL after returning from the bank. */
export function readBankCallback(): BankCallback {
  const params = new URLSearchParams(window.location.search);
  const bank = params.get("bank");
  if (!bank) return null;
  window.history.replaceState({}, "", "/");
  if (bank === "error") return { provider: null, error: params.get("message") || "Połączenie z bankiem nie powiodło się." };
  const provider = params.get("provider") === "enablebanking" ? "enablebanking" : "gocardless";
  return { provider, error: "" };
}
