import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Icon } from "../../components/Icon";
import { bankLabel } from "../../components/Layout";
import { formatDay } from "../../format";
import type { BankCallback } from "../../main";
import type { Account, Bank, BankStatus, Institution } from "../../types";

type Provider = "enablebanking" | "gocardless";

function pickDefault(list: Institution[], current: string): string {
  if (current && list.some((item) => item.id === current)) return current;
  return (list.find((item) => /pko/i.test(item.name)) || list[0])?.id || "";
}

function Stepper({ steps }: { steps: { label: string; done: boolean }[] }) {
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

function LinkedAccounts({ accounts, banks, provider }: { accounts: Account[]; banks: Bank[]; provider: Provider }) {
  const list = accounts.filter((account) => account.provider === provider);
  if (!list.length) return null;
  return (
    <ul className="accounts">
      {list.map((account) => (
        <li key={account.id}>
          <strong>{account.name}</strong>
          <span>
            {bankLabel(banks, account.bank)} · {account.iban || "bez numeru"} · {account.count} operacji
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BankTab({
  banks,
  callback,
  onCallbackDone,
  onAccountsChanged,
}: {
  banks: Bank[];
  callback: BankCallback;
  onCallbackDone: () => void;
  onAccountsChanged: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [provider, setProvider] = useState<Provider>(callback?.provider || "enablebanking");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institution, setInstitution] = useState("");
  const [appId, setAppId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(callback?.error || "");
  const handledCallback = useRef(false);

  async function refresh() {
    const next = await api.bankStatus();
    setStatus(next);
    return next;
  }

  useEffect(() => {
    refresh()
      .then((next) => {
        if (callback?.provider) return;
        if (!next.enablebanking.hasKeys && next.gocardless.hasSecrets) setProvider("gocardless");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!callback || handledCallback.current) return;
    handledCallback.current = true;
    if (!callback.provider) {
      onCallbackDone();
      return;
    }
    setBusy(true);
    api
      .sync(callback.provider)
      .then(async (result) => {
        setMessage(`Połączono z bankiem. Pobrano ${result.imported} nowych transakcji z ${result.accounts} kont.`);
        await refresh();
        await onAccountsChanged();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        setBusy(false);
        onCallbackDone();
      });
  }, [callback]);

  const configured =
    provider === "enablebanking" ? Boolean(status?.enablebanking.hasKeys) : Boolean(status?.gocardless.hasSecrets);

  useEffect(() => {
    if (!configured) {
      setInstitutions([]);
      return;
    }
    let alive = true;
    const load =
      provider === "enablebanking"
        ? api.ebAspsps().then((data) => data.aspsps)
        : api.gcInstitutions().then((data) => data.institutions);
    load
      .then((list) => {
        if (!alive) return;
        setInstitutions(list);
        const saved = provider === "gocardless" ? status?.gocardless.institutionId || "" : "";
        setInstitution((current) => pickDefault(list, current || saved));
      })
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [provider, configured]);

  function switchProvider(next: Provider) {
    setProvider(next);
    setInstitution("");
    setError("");
    setMessage("");
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function saveEbKeys() {
    return run(async () => {
      await api.ebSaveKeys(appId.trim(), privateKey.trim());
      setPrivateKey("");
      setMessage("Zapisano klucz aplikacji Enable Banking.");
      await refresh();
    }, "Nie zapisano klucza");
  }

  function saveGcSecrets() {
    return run(async () => {
      await api.gcSaveSecrets(secretId.trim(), secretKey.trim());
      setSecretKey("");
      setMessage("Zapisano klucze GoCardless.");
      await refresh();
    }, "Nie zapisano kluczy");
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const picked = institutions.find((item) => item.id === institution);
      const { link } =
        provider === "enablebanking"
          ? await api.ebConnect(institution)
          : await api.gcConnect({ sandbox, institutionId: picked?.id, institutionName: picked?.name });
      window.location.href = link;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się połączyć");
      setBusy(false);
    }
  }

  function sync() {
    return run(async () => {
      const result = await api.sync(provider);
      setMessage(`Synchronizacja: ${result.imported} nowych, ${result.skipped} już było, kont: ${result.accounts}.`);
      await refresh();
      await onAccountsChanged();
    }, "Synchronizacja nie powiodła się");
  }

  async function readKeyFile(file: File) {
    setPrivateKey((await file.text()).trim());
  }

  async function copyRedirect() {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.enablebanking.redirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Nie udało się skopiować — zaznacz adres ręcznie.");
    }
  }

  const eb = status?.enablebanking;
  const gc = status?.gocardless;
  const connected = provider === "enablebanking" ? Boolean(eb?.sessions.length) : Boolean(gc?.requisitionId);
  const linked = (status?.accounts || []).filter((account) => account.provider === provider);
  const steps = [
    { label: provider === "enablebanking" ? "Klucz aplikacji" : "Klucze GoCardless", done: configured },
    { label: "Zgoda w banku", done: connected },
    { label: "Pobieranie historii", done: linked.length > 0 },
  ];

  return (
    <>
      <div className="provider-switch">
        <div className="segmented" role="group" aria-label="Dostawca Open Banking">
          <button
            type="button"
            className={provider === "enablebanking" ? "active" : undefined}
            aria-pressed={provider === "enablebanking"}
            onClick={() => switchProvider("enablebanking")}
          >
            Enable Banking
          </button>
          <button
            type="button"
            className={provider === "gocardless" ? "active" : undefined}
            aria-pressed={provider === "gocardless"}
            onClick={() => switchProvider("gocardless")}
          >
            GoCardless
          </button>
        </div>
        <span className="muted">
          {provider === "enablebanking"
            ? "Zalecane — darmowe dla własnych kont, przyjmuje nowe rejestracje."
            : "Dla istniejących kont GoCardless — nowe rejestracje są wstrzymane."}
        </span>
      </div>

      <div className="split">
        <div className="stack">
          <article className="card">
            <Stepper steps={steps} />

            {configured ? (
              <div className="bank-connect">
                <label className="field">
                  Bank
                  <select
                    value={institution}
                    disabled={!institutions.length || (provider === "gocardless" && sandbox)}
                    onChange={(e) => setInstitution(e.target.value)}
                  >
                    {institutions.length ? null : <option value="">Wczytuję listę banków…</option>}
                    {institutions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="bank-actions">
                  <button
                    className={connected ? "ghost" : "primary lg"}
                    type="button"
                    disabled={busy || (!institution && !(provider === "gocardless" && sandbox))}
                    onClick={() => void connect()}
                  >
                    <Icon name="bank" size={18} />
                    {connected ? "Połącz kolejny bank / odnów zgodę" : "Połącz z bankiem"}
                  </button>
                  {connected ? (
                    <button className="primary lg" type="button" disabled={busy} onClick={() => void sync()}>
                      {busy ? "Pobieram…" : "Pobierz nowe transakcje"}
                    </button>
                  ) : null}
                  {provider === "gocardless" ? (
                    <label className="check">
                      <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
                      Sandbox (test bez banku)
                    </label>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="muted">Najpierw zapisz klucze poniżej — potem wybierzesz bank i zalogujesz się na jego stronie.</p>
            )}

            {provider === "enablebanking" && eb?.sessions.length ? (
              <ul className="accounts">
                {eb.sessions.map((session) => (
                  <li key={`${session.aspsp}-${session.validUntil}`}>
                    <strong>{session.aspsp}</strong>
                    <span>
                      zgoda do {session.validUntil ? formatDay(session.validUntil.slice(0, 10)) : "—"} · {session.accounts}{" "}
                      kont
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {provider === "gocardless" && gc?.institutionName ? (
              <p className="muted">Ostatnie połączenie: {gc.institutionName}</p>
            ) : null}
            <LinkedAccounts accounts={status?.accounts || []} banks={banks} provider={provider} />
            {message ? <p className="banner ok">{message}</p> : null}
            {error ? <p className="banner error">{error}</p> : null}
          </article>

          {provider === "enablebanking" ? (
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Klucz aplikacji Enable Banking</h2>
                  <p className="card-sub">Zapisany lokalnie w bazie SQLite na tym komputerze.</p>
                </div>
                <span className={eb?.hasKeys ? "pill ok" : "pill"}>{eb?.hasKeys ? "zapisany" : "brak"}</span>
              </div>
              <form
                className="key-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (appId.trim() && privateKey.trim()) void saveEbKeys();
                }}
              >
                <label>
                  Application ID
                  <input
                    value={appId}
                    placeholder={eb?.appId || "np. 3f1c…-…"}
                    onChange={(e) => setAppId(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Klucz prywatny (.pem)
                  <textarea
                    rows={4}
                    spellCheck={false}
                    value={privateKey}
                    placeholder="-----BEGIN PRIVATE KEY-----"
                    onChange={(e) => setPrivateKey(e.target.value)}
                  />
                </label>
                <div className="row">
                  <label className="ghost sm file-btn">
                    <Icon name="file" size={15} />
                    Wczytaj plik .pem
                    <input
                      type="file"
                      accept=".pem,.key,.txt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void readKeyFile(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className={eb?.hasKeys ? "ghost" : "primary"}
                    type="submit"
                    disabled={busy || !appId.trim() || !privateKey.trim()}
                  >
                    Zapisz klucz
                  </button>
                </div>
              </form>
            </article>
          ) : (
            <article className="card">
              <div className="card-head">
                <div>
                  <h2>Klucze GoCardless</h2>
                  <p className="card-sub">Zapisane lokalnie w bazie SQLite na tym komputerze.</p>
                </div>
                <span className={gc?.hasSecrets ? "pill ok" : "pill"}>{gc?.hasSecrets ? "zapisane" : "brak"}</span>
              </div>
              <form
                className="key-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (secretId && secretKey) void saveGcSecrets();
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
                <button
                  className={gc?.hasSecrets ? "ghost" : "primary"}
                  type="submit"
                  disabled={busy || !secretId || !secretKey}
                >
                  Zapisz klucze
                </button>
              </form>
            </article>
          )}
        </div>

        <article className="card">
          <h2>Jak to działa</h2>
          <p className="muted">
            Banki udostępniają historię tylko licencjonowanym pośrednikom (PSD2). Nie potrzebujesz klucza od banku —
            logujesz się na stronie swojego banku, a tu trafia wyłącznie historia transakcji. Zgoda działa do 90–180
            dni, potem wystarczy ją odnowić.
          </p>
          {provider === "enablebanking" ? (
            <ol className="steps">
              <li>
                Załóż darmowe konto na{" "}
                <a href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer">
                  enablebanking.com
                </a>
                .
              </li>
              <li>
                W Control Panel → <strong>API applications</strong> dodaj aplikację (środowisko Production), wygeneruj
                klucz w przeglądarce i zapisz plik <strong>.pem</strong>.
              </li>
              <li>
                Jako <strong>Redirect URL</strong> podaj:
                {eb ? (
                  <span className="copy-field">
                    <code title={eb.redirectUrl}>{eb.redirectUrl}</code>
                    <button type="button" className="icon-btn" aria-label="Kopiuj adres" onClick={() => void copyRedirect()}>
                      <Icon name={copied ? "check" : "copy"} size={15} />
                    </button>
                  </span>
                ) : null}
              </li>
              <li>
                Aktywuj aplikację przez <strong>Link accounts</strong> — połącz własne konta (tryb prywatny jest
                bezpłatny).
              </li>
              <li>Wklej Application ID i klucz obok, wybierz bank i kliknij „Połącz z bankiem”.</li>
            </ol>
          ) : (
            <ol className="steps">
              <li>
                Zaloguj się na{" "}
                <a href="https://bankaccountdata.gocardless.com/" target="_blank" rel="noreferrer">
                  bankaccountdata.gocardless.com
                </a>
                .
              </li>
              <li>
                Wygeneruj <strong>Secret ID</strong> i <strong>Secret Key</strong>.
              </li>
              <li>Wklej je obok, wybierz bank i kliknij „Połącz z bankiem”.</li>
              <li>Zatwierdź zgodę w bankowości. Zgoda działa do 90 dni.</li>
            </ol>
          )}
        </article>
      </div>
    </>
  );
}
