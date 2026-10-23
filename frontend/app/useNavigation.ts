import { useCallback, useState } from "react";
import { hasBankReturn } from "./bankCallback";
import type { Navigate, Page, SettingsTab } from "./PageManager";

function landing(): { page: Page; settingsTab: SettingsTab } {
  if (hasBankReturn()) return { page: "settings", settingsTab: "bank" };
  return { page: "dashboard", settingsTab: "ai" };
}

/**
 * Current screen of the app (no router). The settings tab lives here because
 * other pages deep-link into a tab (`navigate("settings", "ai")`) and pages
 * take no props. Returning from the bank only chooses the landing screen;
 * BankTab itself reads `?bank=` from the URL.
 */
export function useNavigation() {
  const [{ page, settingsTab }, setScreen] = useState(landing);
  const [paymentsSearch, setPaymentsSearch] = useState("");

  const navigate = useCallback<Navigate>((next, tab) => {
    setScreen((current) => ({
      page: next,
      settingsTab: tab ?? current.settingsTab,
    }));
  }, []);

  const clearPaymentsSearch = useCallback(() => setPaymentsSearch(""), []);

  return { page, settingsTab, navigate, paymentsSearch, setPaymentsSearch, clearPaymentsSearch };
}
