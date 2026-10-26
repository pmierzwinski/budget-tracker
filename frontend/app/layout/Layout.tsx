import type { ReactNode } from "react";
import { getContext } from "../AppContext";
import { DataNote, DownloadButton, FirstVisitWelcome, ShutdownButton, usePlatform } from "../../platform";
import { pages } from "../PageManager";
import { AccountSwitcher } from "../../modules/accounts";
import { Icon } from "../../ui/Icon";
import { NotificationCenter } from "../../modules/notifications";

export function Layout({ children }: { children: ReactNode }) {
  const { meta, currentPage, navigate } = getContext();
  const { showcase, shutdown } = usePlatform();
  const { downloadUrl } = meta.app;
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
          {Object.entries(pages.groups).map(([label, links]) => (
            <div key={label} className="nav-group">
              <p className="nav-label">{label}</p>
              {links.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={currentPage.id === link.id ? "nav-btn active" : "nav-btn"}
                  aria-current={currentPage.id === link.id ? "page" : undefined}
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
          <DataNote />
          {showcase && downloadUrl ? <DownloadButton url={downloadUrl} /> : null}
          {shutdown ? <ShutdownButton quiet /> : null}
        </div>
      </aside>
      <main className="content">
        <NotificationCenter />
        {children}
        <FirstVisitWelcome />
      </main>
    </div>
  );
}
