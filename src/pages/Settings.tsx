import { useApp } from "../app/AppContext";
import type { BankCallback, SettingsTab } from "../app/navigation";
import { DownloadButton } from "../components/DownloadButton";
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
  tab,
  onTab,
  bankCallback,
  onBankCallbackDone,
}: {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  bankCallback: BankCallback;
  onBankCallbackDone: () => void;
}) {
  const { meta, navigate } = useApp();
  const appInfo = meta.app;
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

      {tab === "categories" && <CategoriesTab />}
      {tab === "ai" && <AiTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "bank" && appInfo.hosted ? (
        <div className="empty-card">
          <h2>Połączenie z bankiem działa tylko w aplikacji</h2>
          <p>
            W wersji online nie łączymy się z bankami — dane logowania i historia konta nie powinny trafiać na cudzy
            serwer. Pobierz aplikację, uruchom ją u siebie i połącz konto tutaj. Do tego czasu możesz wgrać plik CSV.
          </p>
          <div className="row">
            {appInfo.downloadUrl ? <DownloadButton url={appInfo.downloadUrl} /> : null}
            <button type="button" className="ghost" onClick={() => navigate("import")}>
              Importuj CSV
            </button>
          </div>
        </div>
      ) : null}
      {tab === "bank" && !appInfo.hosted && (
        <BankTab callback={bankCallback} onCallbackDone={onBankCallbackDone} />
      )}
      {tab === "charts" && <ChartsTab />}
    </section>
  );
}
