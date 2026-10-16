import type { ReactNode } from "react";
import { useApp } from "../app/AppContext";
import { isShowcase } from "../app/showcase";
import { NAV_GROUPS, type Page } from "../app/navigation";
import { AccountSwitcher } from "./AccountSwitcher";
import { DownloadButton } from "./DownloadButton";
import { Icon } from "./Icon";
import { NotificationCenter } from "./NotificationCenter";
import { ShutdownButton } from "./ShutdownButton";
import { FirstVisitWelcome } from "./WelcomeDialog";

export function Layout({ page, children }: { page: Page; children: ReactNode }) {
  const { meta, navigate } = useApp();
  const { app } = meta;
  const showcase = isShowcase(app);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            zł
          </span>
          <div>
            <strong>Wydatki</strong>
            <p>Historia konta</p>
          </div>
        </div>
        {meta.accounts.length > 1 ? <AccountSwitcher /> : null}
        <nav className="nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.links.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={page === link.id ? "nav-btn active" : "nav-btn"}
                  aria-current={page === link.id ? "page" : undefined}
                  title={link.label}
                  onClick={() => navigate(link.id)}
                >
                  <Icon name={link.icon} />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          {app.mode === "web" ? (
            <p className="sidebar-note web-note">
              <strong>Wersja w przeglądarce</strong>
              Dane zapisują się tylko w tej przeglądarce i nigdzie nie są wysyłane. Wyczyszczenie danych przeglądarki je
              usuwa — żeby trzymać je w pliku na dysku, pobierz aplikację.
            </p>
          ) : app.mode === "android" ? (
            <p className="sidebar-note">Dane zostają na tym telefonie i nigdzie nie są wysyłane.</p>
          ) : (
            <p className="sidebar-note">
              Dane zostają na tym komputerze. Logowanie do banku odbywa się wyłącznie na stronie banku.
            </p>
          )}
          {showcase && app.downloadUrl ? <DownloadButton url={app.downloadUrl} /> : null}
          {app.mode === "desktop" ? <ShutdownButton quiet /> : null}
        </div>
      </aside>
      <main className="content">
        <NotificationCenter />
        {children}
        <FirstVisitWelcome key={showcase ? "showcase" : "plain"} />
      </main>
    </div>
  );
}
