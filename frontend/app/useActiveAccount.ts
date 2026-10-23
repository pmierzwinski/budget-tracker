import { useCallback, useState } from "react";

const ACCOUNT_KEY = "wydatki.account";

function savedAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || "";
  } catch {
    return "";
  }
}

/** Account picked in the sidebar ("" = all), remembered in localStorage. */
export function useActiveAccount() {
  const [account, setAccount] = useState(savedAccount);

  const chooseAccount = useCallback((id: string) => {
    try {
      localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      // private mode — the choice just isn't remembered
    }
    setAccount(id);
  }, []);

  return { account, chooseAccount };
}
