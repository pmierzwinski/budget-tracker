import { useEffect, useState } from "react";
import { api } from "../api";
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

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Open Banking</p>
          <h1>Połączenie z PKO</h1>
        </div>
      </header>

      <div className="grid-2">
        <article className="card">
          <h2>Dlaczego nie logujemy się wprost do iPKO?</h2>
          <p>
            Oficjalne API PKO (PSD2 / PolishAPI) jest dostępne tylko dla licencjonowanych TPP. Ta
            aplikacja łączy się z bankiem przez <strong>GoCardless Bank Account Data</strong> —
            licencjonowanego pośrednika. Ty logujesz się na stronie PKO, a my dostajemy wyłącznie
            historię transakcji.
          </p>
          <ol className="steps">
            <li>
              Załóż darmowe konto na{" "}
              <a href="https://bankaccountdata.gocardless.com/" target="_blank" rel="noreferrer">
                bankaccountdata.gocardless.com
              </a>
              .
            </li>
            <li>Wygeneruj <strong>Secret ID</strong> i <strong>Secret Key</strong>.</li>
            <li>Wklej je poniżej i kliknij „Połącz z PKO”.</li>
            <li>Zatwierdź zgodę w bankowości PKO. Zgoda działa do 90 dni.</li>
          </ol>
        </article>

        <article className="card">
          <h2>Klucze i synchronizacja</h2>
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
          <div className="row">
            <button className="ghost" disabled={busy || !secretId || !secretKey} onClick={() => void save()}>
              Zapisz klucze
            </button>
            <label className="check">
              <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
              Sandbox (test bez PKO)
            </label>
          </div>
          <div className="row">
            <button className="primary" disabled={busy || !status?.hasSecrets} onClick={() => void connect()}>
              Połącz z PKO
            </button>
            <button className="ghost" disabled={busy || !status?.requisitionId} onClick={() => void sync()}>
              Pobierz transakcje
            </button>
          </div>
          {status?.hasSecrets && <p className="muted">Klucze są zapisane lokalnie w bazie SQLite.</p>}
          {status?.accounts?.length ? (
            <ul className="accounts">
              {status.accounts.map((account) => (
                <li key={account.id}>
                  <strong>{account.name}</strong>
                  <span>{account.iban || account.id}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {message && <p className="banner ok">{message}</p>}
          {error && <p className="banner error">{error}</p>}
        </article>
      </div>
    </section>
  );
}
