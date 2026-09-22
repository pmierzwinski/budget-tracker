import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

const groups = [
  {
    label: "Analiza",
    links: [
      { id: "dashboard", label: "Przegląd", icon: "dashboard" },
      { id: "trends", label: "Miesiąc do miesiąca", icon: "trends" },
      { id: "transactions", label: "Płatności", icon: "list" },
    ],
  },
  {
    label: "Dane",
    links: [
      { id: "import", label: "Import", icon: "upload" },
      { id: "categories", label: "Kategorie", icon: "tag" },
      { id: "bank", label: "Bank PKO", icon: "bank" },
    ],
  },
] as const satisfies readonly { label: string; links: readonly { id: string; label: string; icon: IconName }[] }[];

export type Page = (typeof groups)[number]["links"][number]["id"];

export function Layout({
  page,
  onPage,
  children,
}: {
  page: Page;
  onPage: (page: Page) => void;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            zł
          </span>
          <div>
            <strong>Wydatki</strong>
            <p>Historia z PKO</p>
          </div>
        </div>
        <nav className="nav">
          {groups.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.links.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={page === link.id ? "nav-btn active" : "nav-btn"}
                  aria-current={page === link.id ? "page" : undefined}
                  title={link.label}
                  onClick={() => onPage(link.id)}
                >
                  <Icon name={link.icon} />
                  <span>{link.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <p className="sidebar-note">
          Dane zostają na tym komputerze. Logowanie do banku odbywa się wyłącznie po stronie PKO.
        </p>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
