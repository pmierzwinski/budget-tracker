import type { Account, Bank, BankServerStatus } from "../../../../../shared/types";
import { bankLabel, formatDay } from "../../../../lib/format";
import { Icon } from "../../../../ui/Icon";
import type { Provider } from "./bank";

export function Stepper({ steps }: { steps: { label: string; done: boolean }[] }) {
  const current = steps.findIndex((step) => !step.done);
  return (
    <ol className="stepper">
      {steps.map((step, index) => (
        <li key={step.label} className={step.done ? "done" : index === current ? "current" : undefined}>
          <span className="stepper-dot">{step.done ? <Icon name="check" size={14} /> : index + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

/** Bank consents (Enable Banking) or the last connection (GoCardless), and the accounts linked to the provider. */
export function Connections({
  provider,
  status,
  linked,
  banks,
}: {
  provider: Provider;
  status: BankServerStatus | null;
  linked: Account[];
  banks: Bank[];
}) {
  const sessions = provider === "enablebanking" ? status?.enablebanking.sessions || [] : [];
  const lastBank = provider === "gocardless" ? status?.gocardless.institutionName : null;
  return (
    <>
      {sessions.length ? (
        <ul className="accounts">
          {sessions.map((session) => (
            <li key={`${session.aspsp}-${session.validUntil}`}>
              <strong>{session.aspsp}</strong>
              <span>
                zgoda do {session.validUntil ? formatDay(session.validUntil.slice(0, 10)) : "—"} · {session.accounts} kont
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {lastBank ? <p className="muted">Ostatnie połączenie: {lastBank}</p> : null}
      {linked.length ? (
        <ul className="accounts">
          {linked.map((account) => (
            <li key={account.id}>
              <strong>{account.name}</strong>
              <span>
                {bankLabel(banks, account.bank)} · {account.iban || "bez numeru"} · {account.count} operacji
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
