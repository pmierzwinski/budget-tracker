import { useCallback, useState } from "react";
import type { Navigate, Page, SettingsTab } from "./PageManager";

/**
 * Current screen of the app (no router). The settings tab lives here because
 * other pages deep-link into a tab (`navigate("settings", "ai")`) and pages
 * take no props.
 */
export function useNavigation() {
  const [{ page, settingsTab }, setScreen] = useState<{ page: Page; settingsTab: SettingsTab }>({
    page: "dashboard",
    settingsTab: "ai",
  });
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
