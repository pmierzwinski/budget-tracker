import { useCallback, useEffect, useMemo, useState } from "react";
import { api, setActiveAccount } from "../api";
import { Layout } from "../components/Layout";
import { Dashboard } from "../pages/dashboard/Dashboard";
import { ImportPage } from "../pages/ImportPage";
import { Limits } from "../pages/Limits";
import { Settings } from "../pages/Settings";
import { Stats } from "../pages/stats/Stats";
import { Transactions } from "../pages/Transactions";
import type { Meta } from "../types";
import { AppContext, type AppState } from "./AppContext";
import { followsAccount, readBankCallback, type Navigate, type Page, type SettingsTab } from "./navigation";
import {
  loadNotifications,
  makeNotification,
  saveNotifications,
  type AppNotification,
  type NotificationDraft,
} from "./notifications";

const ACCOUNT_KEY = "wydatki.account";

function savedAccount(): string {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || "";
  } catch {
    return "";
  }
}

export function App() {
  const [bankCallback, setBankCallback] = useState(readBankCallback);
  const [page, setPage] = useState<Page>(bankCallback ? "settings" : "dashboard");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("bank");
  const [account, setAccount] = useState(() => {
    const saved = savedAccount();
    setActiveAccount(saved);
    return saved;
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ viewKey: string; meta: Meta } | null>(null);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState(loadNotifications);
  const [txQuery, setTxQuery] = useState("");

  const viewKey = followsAccount(page) ? `${page}|${account}|${dataVersion}` : page;

  const chooseAccount = useCallback((id: string) => {
    setActiveAccount(id);
    try {
      localStorage.setItem(ACCOUNT_KEY, id);
    } catch {
      // private mode — the choice just isn't remembered
    }
    setAccount(id);
  }, []);

  const fetchMeta = useCallback(
    async (forView: string) => {
      const meta = await api.meta();
      if (account && !meta.accounts.some((row) => row.id === account)) {
        chooseAccount("");
        return meta;
      }
      setLoaded({ viewKey: forView, meta });
      setError("");
      return meta;
    },
    [account, chooseAccount],
  );

  // Every page (and account switch) starts from fresh /meta; the page mounts once it has arrived.
  useEffect(() => {
    fetchMeta(viewKey).catch((err: Error) => setError(err.message));
  }, [viewKey, fetchMeta]);

  const navigate: Navigate = useCallback(
    (next, tab) => {
      if (tab) setSettingsTab(tab);
      else if (next === "settings" && page !== "settings") setSettingsTab("ai");
      setPage(next);
    },
    [page],
  );

  const notify = useCallback((draft: NotificationDraft) => {
    setNotifications((current) => {
      const next = [makeNotification(draft), ...current].slice(0, 20);
      saveNotifications(next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, read: true } : item));
      saveNotifications(next);
      return next;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  const openNotification = useCallback(
    (item: AppNotification) => {
      markRead(item.id);
      if (item.page) navigate(item.page);
      if (item.q) setTxQuery(item.q);
    },
    [markRead, navigate],
  );

  const state = useMemo<AppState | null>(
    () =>
      loaded && {
        meta: loaded.meta,
        refreshMeta: () => fetchMeta(viewKey),
        account,
        chooseAccount,
        reloadPage: async () => {
          await fetchMeta(viewKey);
          setDataVersion((value) => value + 1);
        },
        navigate,
        notifications,
        notify,
        markRead,
        clearNotifications,
        openNotification,
        txQuery,
        clearTxQuery: () => setTxQuery(""),
      },
    [
      loaded,
      fetchMeta,
      viewKey,
      account,
      chooseAccount,
      navigate,
      notifications,
      notify,
      markRead,
      clearNotifications,
      openNotification,
      txQuery,
    ],
  );

  if (!state) return <p className={error ? "banner error" : "muted loading"}>{error || "Ładowanie…"}</p>;

  return (
    <AppContext.Provider value={state}>
      <Layout page={page}>
        {loaded?.viewKey === viewKey ? (
          <div className="page-host" key={viewKey}>
            {page === "dashboard" && <Dashboard />}
            {page === "stats" && <Stats />}
            {page === "transactions" && <Transactions />}
            {page === "limits" && <Limits />}
            {page === "import" && <ImportPage />}
            {page === "settings" && (
              <Settings
                tab={settingsTab}
                onTab={setSettingsTab}
                bankCallback={bankCallback}
                onBankCallbackDone={() => setBankCallback(null)}
              />
            )}
          </div>
        ) : (
          <p className="muted loading">Ładowanie…</p>
        )}
      </Layout>
    </AppContext.Provider>
  );
}
