import { DownloadButton, type Navigate, type SettingsTab } from "../components/Layout";
import type { BankCallback } from "../main";
import type { AppInfo, Bank } from "../types";
import { AccountsTab } from "./settings/AccountsTab";
import { AiTab } from "./settings/AiTab";
import { BankTab } from "./settings/BankTab";
import { CategoriesTab } from "./settings/CategoriesTab";
import { ChartsTab } from "./settings/ChartsTab";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "categories", label: "Kategorie" },
  { id: "ai", label: "AI" },
  { id: "accounts", label: "Konta" },
  { id: "bank", label: "Połączenie z bankiem" },
  { id: "charts", label: "Wykresy" },
];

export function Settings({
  appInfo,
  tab,
  onTab,
  onNavigate,
  banks,
  bankCallback,
  onBankCallbackDone,
  onAccountsChanged,
}: {
  appInfo: AppInfo;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onNavigate: Navigate;
  banks: Bank[];
  bankCallback: BankCallback;
  onBankCallbackDone: () => void;
  onAccountsChanged: () => void | Promise<void>;
}) {
  return (
    <section className="page">
      <header className="page-head settings-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Ustawienia</h1>
        </div>
        <div className="segmented settings-tabs" role="tablist" aria-label="Sekcje ustawień">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : undefined}
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "categories" && <CategoriesTab onNavigate={onNavigate} />}
      {tab === "ai" && <AiTab />}
      {tab === "accounts" && <AccountsTab banks={banks} onNavigate={onNavigate} onAccountsChanged={onAccountsChanged} />}
      {tab === "bank" && appInfo.hosted ? (
        <div className="empty-card">
          <h2>Połączenie z bankiem działa tylko w aplikacji</h2>
          <p>
            W wersji online nie łączymy się z bankami — dane logowania i historia konta nie powinny trafiać na cudzy
            serwer. Pobierz aplikację, uruchom ją u siebie i połącz konto tutaj. Do tego czasu możesz wgrać plik CSV.
          </p>
          <div className="row">
            {appInfo.downloadUrl ? <DownloadButton url={appInfo.downloadUrl} /> : null}
            <button type="button" className="ghost" onClick={() => onNavigate("import")}>
              Importuj CSV
            </button>
          </div>
        </div>
      ) : null}
      {tab === "bank" && !appInfo.hosted && (
        <BankTab
          banks={banks}
          callback={bankCallback}
          onCallbackDone={onBankCallbackDone}
          onAccountsChanged={onAccountsChanged}
        />
      )}
      {tab === "charts" && <ChartsTab />}
    </section>
  );
}
