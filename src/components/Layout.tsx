import { useEffect, useRef, useState, type ReactNode } from "react";
import { plural } from "../format";
import type { Account, AppInfo, Bank } from "../types";
import { Icon, type IconName } from "./Icon";

export function DownloadButton({ url, quiet, large }: { url: string; quiet?: boolean; large?: boolean }) {
  return (
    <a
      className={`download-btn${quiet ? " quiet" : ""}${large ? " lg" : ""}`}
      href={url}
      download
      title="Wydatki na Windows — działa offline, dane zostają na Twoim komputerze"
    >
      <Icon name="download" size={16} />
      <span>Pobierz aplikację</span>
    </a>
  );
}

const groups = [
  {
    label: "Analiza",
    links: [
      { id: "dashboard", label: "Przegląd", icon: "dashboard" },
      { id: "stats", label: "Statystyki", icon: "trends" },
      { id: "transactions", label: "Płatności", icon: "list" },
      { id: "limits", label: "Limity", icon: "gauge" },
    ],
  },
  {
    label: "Dane",
    links: [
      { id: "import", label: "Import", icon: "upload" },
      { id: "settings", label: "Ustawienia", icon: "settings" },
    ],
  },
] as const satisfies readonly { label: string; links: readonly { id: string; label: string; icon: IconName }[] }[];

export type Page = (typeof groups)[number]["links"][number]["id"];

export type SettingsTab = "categories" | "ai" | "accounts" | "bank" | "charts";

export type Navigate = (page: Page, tab?: SettingsTab) => void;

export function bankLabel(banks: Bank[], id: string): string {
  return banks.find((bank) => bank.id === id)?.name || id;
}

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

function AccountSwitcher({
  accounts,
  banks,
  value,
  onChange,
  onManage,
}: {
  accounts: Account[];
  banks: Bank[];
  value: string;
  onChange: (id: string) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = accounts.find((account) => account.id === value);
  const total = accounts.reduce((sum, account) => sum + account.count, 0);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    onChange(id);
  }

  return (
    <div className="account-switch" ref={ref}>
      <button
        type="button"
        className={current ? "account-btn picked" : "account-btn"}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current ? `Konto: ${current.name}` : "Wszystkie konta"}
        onClick={() => setOpen(!open)}
      >
        <span className="account-avatar" aria-hidden>
          {current ? initials(current.name) : <Icon name="wallet" size={16} />}
        </span>
        <span className="account-copy">
          <strong>{current ? current.name : "Wszystkie konta"}</strong>
          <em>
            {current
              ? bankLabel(banks, current.bank)
              : `${accounts.length} ${plural(accounts.length, "konto", "konta", "kont")} · ${total} operacji`}
          </em>
        </span>
        <Icon name="down" size={15} />
      </button>
      {open ? (
        <div className="popover account-menu" role="listbox" aria-label="Wybierz konto">
          <button
            type="button"
            role="option"
            aria-selected={!current}
            className={!current ? "account-option active" : "account-option"}
            onClick={() => pick("")}
          >
            <span className="account-avatar" aria-hidden>
              <Icon name="wallet" size={16} />
            </span>
            <span className="account-copy">
              <strong>Wszystkie konta</strong>
              <em>{total} operacji</em>
            </span>
            {!current ? <Icon name="check" size={16} /> : null}
          </button>
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              role="option"
              aria-selected={account.id === value}
              className={account.id === value ? "account-option active" : "account-option"}
              onClick={() => pick(account.id)}
            >
              <span className="account-avatar" aria-hidden>
                {initials(account.name)}
              </span>
              <span className="account-copy">
                <strong>{account.name}</strong>
                <em>
                  {bankLabel(banks, account.bank)} · {account.count} operacji
                </em>
              </span>
              {account.id === value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
          <button
            type="button"
            className="link-btn account-manage"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            Zarządzaj kontami
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Layout({
  page,
  onPage,
  accounts,
  banks,
  account,
  onAccount,
  appInfo,
  children,
}: {
  page: Page;
  onPage: Navigate;
  accounts: Account[];
  banks: Bank[];
  account: string;
  onAccount: (id: string) => void;
  appInfo: AppInfo;
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
            <p>Historia konta</p>
          </div>
        </div>
        {accounts.length > 1 ? (
          <AccountSwitcher
            accounts={accounts}
            banks={banks}
            value={account}
            onChange={onAccount}
            onManage={() => onPage("settings", "accounts")}
          />
        ) : null}
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
        <div className="sidebar-foot">
          {appInfo.hosted ? (
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
          {appInfo.downloadUrl ? <DownloadButton url={appInfo.downloadUrl} quiet={!appInfo.hosted} /> : null}
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
