import type { ReactNode } from "react";

const links = [
  { id: "dashboard", label: "Przegląd" },
  { id: "trends", label: "Miesiąc do miesiąca" },
  { id: "transactions", label: "Płatności" },
  { id: "import", label: "Import" },
  { id: "categories", label: "Kategorie" },
  { id: "bank", label: "Bank PKO" },
] as const;

export type Page = (typeof links)[number]["id"];

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
        <nav>
          {links.map((link) => (
            <button
              key={link.id}
              className={page === link.id ? "nav-btn active" : "nav-btn"}
              onClick={() => onPage(link.id)}
            >
              {link.label}
            </button>
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
