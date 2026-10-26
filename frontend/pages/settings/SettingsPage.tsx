import { getContext } from "../../app/AppContext";
import type { SettingsTab } from "../../app/PageManager";
import { AccountsTab } from "./tabs/AccountsTab";
import { AiTab } from "./tabs/AiTab";
import { AppTab } from "./tabs/AppTab";
import { ChartsTab } from "./tabs/ChartsTab";
import "./settings.css";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "accounts", label: "Konta" },
  { id: "charts", label: "Wykresy" },
  { id: "app", label: "Aplikacja" },
];

export function SettingsPage() {
  const { settingsTab: tab, navigate } = getContext();
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
              onClick={() => navigate("settings", item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "ai" && <AiTab />}
      {tab === "accounts" && <AccountsTab />}
      {tab === "charts" && <ChartsTab />}
      {tab === "app" && <AppTab />}
    </section>
  );
}
