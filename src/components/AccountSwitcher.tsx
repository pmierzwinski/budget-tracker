import { useRef, useState, type ReactNode } from "react";
import { useApp } from "../app/AppContext";
import { bankLabel, plural } from "../format";
import { useDismiss } from "../hooks/useDismiss";
import { Icon } from "./Icon";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

function AccountOption({
  active,
  avatar,
  name,
  detail,
  onPick,
}: {
  active: boolean;
  avatar: ReactNode;
  name: string;
  detail: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={active ? "account-option active" : "account-option"}
      onClick={onPick}
    >
      <span className="account-avatar" aria-hidden>
        {avatar}
      </span>
      <span className="account-copy">
        <strong>{name}</strong>
        <em>{detail}</em>
      </span>
      {active ? <Icon name="check" size={16} /> : null}
    </button>
  );
}

/** Global account filter in the sidebar (shown from 2 accounts). */
export function AccountSwitcher() {
  const { meta, account: value, chooseAccount, navigate } = useApp();
  const { accounts, banks } = meta;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = accounts.find((account) => account.id === value);
  const total = accounts.reduce((sum, account) => sum + account.count, 0);
  useDismiss(open, ref, () => setOpen(false));

  function pick(id: string) {
    setOpen(false);
    chooseAccount(id);
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
          <AccountOption
            active={!current}
            avatar={<Icon name="wallet" size={16} />}
            name="Wszystkie konta"
            detail={`${total} operacji`}
            onPick={() => pick("")}
          />
          {accounts.map((account) => (
            <AccountOption
              key={account.id}
              active={account.id === value}
              avatar={initials(account.name)}
              name={account.name}
              detail={`${bankLabel(banks, account.bank)} · ${account.count} operacji`}
              onPick={() => pick(account.id)}
            />
          ))}
          <button
            type="button"
            className="link-btn account-manage"
            onClick={() => {
              setOpen(false);
              navigate("settings", "accounts");
            }}
          >
            Zarządzaj kontami
          </button>
        </div>
      ) : null}
    </div>
  );
}
