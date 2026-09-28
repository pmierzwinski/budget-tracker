import type { ReactNode } from "react";
import { useApp } from "../app/AppContext";
import { NAV_GROUPS, type Page } from "../app/navigation";
import { AccountSwitcher } from "./AccountSwitcher";
import { DownloadButton } from "./DownloadButton";
import { Icon } from "./Icon";

export function Layout({ page, children }: { page: Page; children: ReactNode }) {
  const { meta, navigate } = useApp();
  const { app } = meta;
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
          {app.hosted ? (
            <p className="sidebar-note hosted-note">
              <strong>Wersja online</strong>
              Twoje dane są tymczasowe i widzisz je tylko Ty — znikną po dobie bez aktywności. Żeby trzymać je u siebie
              i używać offline, pobierz aplikację.
            </p>
          ) : (
            <p className="sidebar-note">
              Dane zostają na tym komputerze. Logowanie do banku odbywa się wyłącznie na stronie banku.
            </p>
          )}
          {app.downloadUrl ? <DownloadButton url={app.downloadUrl} quiet={!app.hosted} /> : null}
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
