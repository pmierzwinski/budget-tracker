// Pages (no router: the current page is state in App) and the bank-login redirect.
import type { IconName } from "../components/Icon";

export const NAV_GROUPS = [
  {
    label: "Analiza",
    links: [
      { id: "dashboard", label: "Przegląd", icon: "dashboard" },
      { id: "stats", label: "Statystyki", icon: "trends" },
      { id: "transactions", label: "Płatności", icon: "list" },
      { id: "limits", label: "Kategorie", icon: "tag" },
    ],
  },
  {
    label: "Dane",
    links: [
      { id: "import", label: "Import", icon: "upload" },
      { id: "settings", label: "Ustawienia", icon: "settings" },
    ],
  },
] as const satisfies readonly { label: string; links: readonly { id: string; label: string; icon: IconName }[] }[];

export type Page = (typeof NAV_GROUPS)[number]["links"][number]["id"];

export type SettingsTab = "ai" | "accounts" | "bank" | "charts" | "app";

export type Navigate = (page: Page, tab?: SettingsTab) => void;

/** Analysis pages follow the active account; the others don't remount when it changes. */
export function followsAccount(page: Page): boolean {
  return page !== "import" && page !== "settings";
}

export type BankCallback = { provider: "gocardless" | "enablebanking" | null; error: string } | null;

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
