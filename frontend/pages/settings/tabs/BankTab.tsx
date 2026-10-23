import { useEffect, useRef, useState } from "react";
import type { BankServerStatus, Institution } from "../../../../shared/types";
import { getContext } from "../../../app/AppContext";
import { readBankCallback } from "../../../app/bankCallback";
import { Icon } from "../../../ui/Icon";
import { Notices } from "../../../ui/Notices";
import { Segmented } from "../../../ui/Segmented";
import { useAction } from "../../../lib/useAction";
import { bank, syncBank, type Provider } from "./bank/bank";
import { Connections, Stepper } from "./bank/Connections";
import { HowItWorks } from "./bank/HowItWorks";
import { EnableBankingKeys, GoCardlessKeys } from "./bank/KeyCards";

const PROVIDERS = [
  { id: "enablebanking", label: "Enable Banking" },
  { id: "gocardless", label: "GoCardless" },
] as const;

function pickDefault(list: Institution[], current: string): string {
  if (current && list.some((item) => item.id === current)) return current;
  return (list.find((item) => /pko/i.test(item.name)) || list[0])?.id || "";
}

export function BankTab() {
  const { database, meta } = getContext();
  const [callback] = useState(readBankCallback);
  const [status, setStatus] = useState<BankServerStatus | null>(null);
  const [provider, setProvider] = useState<Provider>(callback?.provider || "enablebanking");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institution, setInstitution] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const { busy, message, error, setMessage, setError, run } = useAction();
  const handledCallback = useRef(false);

  async function refresh() {
    const next = await bank.status();
    setStatus(next);
    return next;
  }

  useEffect(() => {
    if (callback?.error) setError(callback.error);
    refresh()
      .then((next) => {
        if (!callback?.provider && !next.enablebanking.hasKeys && next.gocardless.hasSecrets) setProvider("gocardless");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!callback?.provider || handledCallback.current) return;
    handledCallback.current = true;
    const returned = callback.provider;
    void run(async () => {
      const result = await syncBank(database, returned);
      setMessage(`Połączono z bankiem. Pobrano ${result.imported} nowych transakcji z ${result.accounts} kont.`);
      await refresh();
    }, "Synchronizacja nie powiodła się");
  }, [callback]);

  const configured = provider === "enablebanking" ? Boolean(status?.enablebanking.hasKeys) : Boolean(status?.gocardless.hasSecrets);

  useEffect(() => {
    if (!configured) {
      setInstitutions([]);
      return;
    }
    let alive = true;
    bank
      .institutions(provider)
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

  async function keysSaved(text: string) {
    setMessage(text);
    await refresh();
  }

  function connect() {
    return run(async () => {
      const picked = institutions.find((item) => item.id === institution);
      const { link } =
        provider === "enablebanking"
          ? await bank.connectEnableBanking(institution)
          : await bank.connectGoCardless({ sandbox, institutionId: picked?.id, institutionName: picked?.name });
      window.location.href = link;
    }, "Nie udało się połączyć");
  }

  function sync() {
    return run(async () => {
      const result = await syncBank(database, provider);
      setMessage(`Synchronizacja: ${result.imported} nowych, ${result.skipped} już było, kont: ${result.accounts}.`);
      await refresh();
    }, "Synchronizacja nie powiodła się");
  }

  const connected = provider === "enablebanking" ? Boolean(status?.enablebanking.sessions.length) : Boolean(status?.gocardless.requisitionId);
  const linked = meta.accounts.filter((account) => account.provider === provider);
  const steps = [
    { label: provider === "enablebanking" ? "Klucz aplikacji" : "Klucze GoCardless", done: configured },
    { label: "Zgoda w banku", done: connected },
    { label: "Pobieranie historii", done: linked.length > 0 },
  ];
  const keys = { status, busy, run, onSaved: keysSaved };

  return (
    <>
      <div className="provider-switch">
        <Segmented options={PROVIDERS} value={provider} onChange={switchProvider} label="Dostawca Open Banking" />
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
            <Connections provider={provider} status={status} linked={linked} banks={meta.banks} />
            <Notices message={message} error={error} />
          </article>

          {provider === "enablebanking" ? <EnableBankingKeys {...keys} /> : <GoCardlessKeys {...keys} />}
        </div>

        <HowItWorks provider={provider} redirectUrl={status?.enablebanking.redirectUrl} onError={setError} />
      </div>
    </>
  );
}
