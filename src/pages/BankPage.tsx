import { useEffect, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import type { BankStatus } from "../types";

export function BankPage({ autoSync }: { autoSync: boolean }) {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await api.bankStatus());
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!autoSync) return;
    setBusy(true);
    api
      .sync()
      .then((result) => {
        setMessage(`Pobrano ${result.imported} transakcji z PKO.`);
        return refresh();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [autoSync]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.saveSecrets(secretId, secretKey);
      setMessage("Zapisano klucze GoCardless.");
      setSecretKey("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano kluczy");
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { link } = await api.connect(sandbox);
      window.location.href = link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się połączyć");
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError("");
    try {
      const result = await api.sync();
      setMessage(
        `Synchronizacja: ${result.imported} nowych, ${result.skipped} już było, kont: ${result.accounts}.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synchronizacja nie powiodła się");
    } finally {
      setBusy(false);
    }
  }

  const hasSecrets = Boolean(status?.hasSecrets);
  const connected = Boolean(status?.requisitionId);
  const accounts = status?.accounts ?? [];
  const steps = [
    { label: "Klucze GoCardless", done: hasSecrets },
    { label: "Zgoda w PKO", done: connected },
    { label: "Pobieranie historii", done: accounts.length > 0 },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Bank PKO</h1>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          <article className="card">
            <ol className="stepper">
              {steps.map((step, index) => (
                <li
                  key={step.label}
                  className={step.done ? "done" : index === current ? "current" : undefined}
                >
                  <span className="stepper-dot">{step.done ? <Icon name="check" size={14} /> : index + 1}</span>
                  {step.label}
                </li>
              ))}
            </ol>

            <div className="bank-actions">
              {connected ? (
                <>
                  <button className="primary lg" type="button" disabled={busy} onClick={() => void sync()}>
                    {busy ? "Pobieram…" : "Pobierz nowe transakcje"}
                  </button>
                  <button className="ghost" type="button" disabled={busy || !hasSecrets} onClick={() => void connect()}>
                    Odnów zgodę
                  </button>
                </>
              ) : (
                <button
                  className="primary lg"
                  type="button"
                  disabled={busy || !hasSecrets}
                  onClick={() => void connect()}
                >
                  <Icon name="bank" size={18} />
                  Połącz z PKO
                </button>
              )}
              <label className="check">
                <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
                Sandbox (test bez PKO)
              </label>
            </div>
            {!hasSecrets ? <p className="muted">Najpierw wklej klucze GoCardless poniżej.</p> : null}

            {accounts.length ? (
              <ul className="accounts">
                {accounts.map((account) => (
                  <li key={account.id}>
                    <strong>{account.name}</strong>
                    <span>{account.iban || account.id}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {message ? <p className="banner ok">{message}</p> : null}
            {error ? <p className="banner error">{error}</p> : null}
          </article>

          <article className="card">
            <div className="card-head">
              <div>
                <h2>Klucze GoCardless</h2>
                <p className="card-sub">Zapisane lokalnie w bazie SQLite na tym komputerze.</p>
              </div>
              <span className={hasSecrets ? "pill ok" : "pill"}>{hasSecrets ? "zapisane" : "brak"}</span>
            </div>
            <form
              className="key-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (secretId && secretKey) void save();
              }}
            >
              <label>
                Secret ID
                <input value={secretId} onChange={(e) => setSecretId(e.target.value)} autoComplete="off" />
              </label>
              <label>
                Secret Key
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button className={hasSecrets ? "ghost" : "primary"} type="submit" disabled={busy || !secretId || !secretKey}>
                Zapisz klucze
              </button>
            </form>
          </article>
        </div>

        <article className="card">
          <h2>Jak to działa</h2>
          <p className="muted">
            Oficjalne API PKO (PSD2 / PolishAPI) jest dostępne tylko dla licencjonowanych TPP. Aplikacja łączy się
            przez <strong>GoCardless Bank Account Data</strong> — logujesz się na stronie PKO, a tu trafia wyłącznie
            historia transakcji.
          </p>
          <ol className="steps">
            <li>
              Załóż darmowe konto na{" "}
              <a href="https://bankaccountdata.gocardless.com/" target="_blank" rel="noreferrer">
                bankaccountdata.gocardless.com
              </a>
              .
            </li>
            <li>
              Wygeneruj <strong>Secret ID</strong> i <strong>Secret Key</strong>.
            </li>
            <li>Wklej je obok i kliknij „Połącz z PKO”.</li>
            <li>Zatwierdź zgodę w bankowości PKO. Zgoda działa do 90 dni.</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
