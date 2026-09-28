import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, setActiveAccount } from "./api";
import { Layout, type Page, type SettingsTab } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ImportPage } from "./pages/ImportPage";
import { Limits } from "./pages/Limits";
import { Settings } from "./pages/Settings";
import { Stats } from "./pages/Stats";
import { Transactions } from "./pages/Transactions";
import type { Account, AppInfo, Bank } from "./types";
import "./index.css";

export type BankCallback = { provider: "gocardless" | "enablebanking" | null; error: string } | null;

function readBankCallback(): BankCallback {
  const params = new URLSearchParams(window.location.search);
  const bank = params.get("bank");
  if (!bank) return null;
  window.history.replaceState({}, "", "/");
  if (bank === "error") return { provider: null, error: params.get("message") || "Połączenie z bankiem nie powiodło się." };
  const provider = params.get("provider") === "enablebanking" ? "enablebanking" : "gocardless";
  return { provider, error: "" };
}

const ACCOUNT_KEY = "wydatki.account";

function App() {
  const [bankCallback, setBankCallback] = useState(readBankCallback);
  const [page, setPage] = useState<Page>(bankCallback ? "settings" : "dashboard");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("bank");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState(() => {
    const saved = localStorage.getItem(ACCOUNT_KEY) || "";
    setActiveAccount(saved);
    return saved;
  });
  const [ready, setReady] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo>({ hosted: false, packaged: false, downloadUrl: "" });
  const [dataVersion, setDataVersion] = useState(0);

  const chooseAccount = useCallback((id: string) => {
    setActiveAccount(id);
    localStorage.setItem(ACCOUNT_KEY, id);
    setAccount(id);
  }, []);

  const refreshAccounts = useCallback(async () => {
    const data = await api.meta();
    setAccounts(data.accounts);
    setBanks(data.banks);
    if (data.app) setAppInfo(data.app);
    return data.accounts;
  }, []);

  useEffect(() => {
    refreshAccounts()
      .then((list) => {
        if (account && !list.some((row) => row.id === account)) chooseAccount("");
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  function navigate(next: Page, tab?: SettingsTab) {
    if (tab) setSettingsTab(tab);
    else if (next === "settings" && page !== "settings") setSettingsTab("categories");
    setPage(next);
  }

  async function onAccountsChanged() {
    const list = await refreshAccounts();
    if (account && !list.some((row) => row.id === account)) chooseAccount("");
  }

  async function onDemoCreated() {
    await onAccountsChanged();
    setDataVersion((value) => value + 1);
  }

  return (
    <Layout
      page={page}
      onPage={navigate}
      accounts={accounts}
      banks={banks}
      account={account}
      onAccount={chooseAccount}
      appInfo={appInfo}
    >
      {ready ? (
        <div
          className="page-host"
          key={page === "import" || page === "settings" ? page : `${page}|${account}|${dataVersion}`}
        >
          {page === "dashboard" && <Dashboard onNavigate={navigate} appInfo={appInfo} onDemoCreated={onDemoCreated} />}
          {page === "stats" && <Stats onNavigate={navigate} />}
          {page === "transactions" && <Transactions onNavigate={navigate} />}
          {page === "limits" && <Limits />}
          {page === "import" && (
            <ImportPage
              hosted={appInfo.hosted}
              accounts={accounts}
              banks={banks}
              onNavigate={navigate}
              onImported={(importedAccount) => {
                void onAccountsChanged();
                if (account && importedAccount !== account) chooseAccount(importedAccount);
              }}
            />
          )}
          {page === "settings" && (
            <Settings
              appInfo={appInfo}
              tab={settingsTab}
              onTab={setSettingsTab}
              onNavigate={navigate}
              banks={banks}
              bankCallback={bankCallback}
              onBankCallbackDone={() => setBankCallback(null)}
              onAccountsChanged={onAccountsChanged}
            />
          )}
        </div>
      ) : null}
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
