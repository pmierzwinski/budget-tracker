import { useApp } from "../app/AppContext";
import type { BankCallback, SettingsTab } from "../app/navigation";
import { DownloadButton } from "../components/DownloadButton";
import { AccountsTab } from "./settings/AccountsTab";
import { AiTab } from "./settings/AiTab";
import { AppTab } from "./settings/AppTab";
import { BankTab } from "./settings/BankTab";
import { ChartsTab } from "./settings/ChartsTab";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "accounts", label: "Konta" },
  { id: "bank", label: "Połączenie z bankiem" },
  { id: "charts", label: "Wykresy" },
  { id: "app", label: "Aplikacja" },
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

      {tab === "ai" && <AiTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "bank" && (appInfo.mode === "web" || appInfo.mode === "android") ? (
        <div className="empty-card">
          <h2>
            {appInfo.mode === "android"
              ? "Połączenie z bankiem będzie w kolejnej wersji"
              : "Połączenie z bankiem działa tylko w aplikacji"}
          </h2>
          <p>
            {appInfo.mode === "android"
              ? "Na razie wgraj plik CSV wyeksportowany z bankowości — instrukcja dla Twojego banku jest w zakładce Import."
              : "Wersja w przeglądarce nie ma serwera, a połączenie z bankiem go wymaga (klucze aplikacji, powrót ze strony banku). Pobierz aplikację, uruchom ją u siebie i połącz konto tutaj. Do tego czasu możesz wgrać plik CSV."}
          </p>
          <div className="row">
            {appInfo.mode === "web" && appInfo.downloadUrl ? <DownloadButton url={appInfo.downloadUrl} /> : null}
            <button type="button" className="ghost" onClick={() => navigate("import")}>
              Importuj CSV
            </button>
          </div>
        </div>
      ) : null}
      {tab === "bank" && (appInfo.mode === "local" || appInfo.mode === "desktop") && (
        <BankTab callback={bankCallback} onCallbackDone={onBankCallbackDone} />
      )}
      {tab === "charts" && <ChartsTab />}
      {tab === "app" && <AppTab />}
    </section>
  );
}
