import { useEffect, useMemo, useState } from "react";
import type { Database } from "../db";
import { useNotifications } from "../modules/notifications";
import { loadEnvironment, type Environment } from "../platform";
import type { AppState } from "./AppContext";
import { computeMeta } from "./meta";
import { pages } from "./PageManager";
import { useActiveAccount } from "./useActiveAccount";
import { useNavigation } from "./useNavigation";

/** Opens the data and builds the context. `context` is null until loaded (or when opening failed — see `error`). */
export function getAppContext(database: Database): { context: AppState | null; error: string } {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [generation, setGeneration] = useState(0);
  const { account, chooseAccount } = useActiveAccount();
  const { page, settingsTab, navigate, paymentsSearch, setPaymentsSearch, clearPaymentsSearch } = useNavigation();
  const { notifications, notify, markRead, clearNotifications } = useNotifications();

  useEffect(() => {
    Promise.all([loadEnvironment(), database.load()])
      .then(([loaded]) => setEnvironment(loaded))
      .catch((err: Error) => setError(err.message));
    return database.subscribe(() => setVersion((n) => n + 1));
  }, [database]);

  const meta = useMemo(
    () => (environment ? computeMeta(database.data, account, environment) : null),
    [database, environment, account, version],
  );

  useEffect(() => {
    if (meta && account && !meta.accounts.some((row) => row.id === account)) chooseAccount("");
  }, [meta, account, chooseAccount]);

  if (!environment || !meta) return { context: null, error };

  const key = pages.link(page).followsAccount ? `${page}|${account}|${generation}` : page;
  return {
    error,
    context: {
      database,
      env: environment.env,
      meta,
      account,
      chooseAccount,
      reloadPage: () => setGeneration((n) => n + 1),
      currentPage: { id: page, key },
      navigate,
      settingsTab,
      notifications,
      notify,
      markRead,
      clearNotifications,
      paymentsSearch,
      setPaymentsSearch,
      clearPaymentsSearch,
    },
  };
}
