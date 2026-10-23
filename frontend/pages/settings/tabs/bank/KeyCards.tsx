import { useState } from "react";
import type { BankServerStatus } from "../../../../../shared/types";
import { Icon } from "../../../../ui/Icon";
import { bank } from "./bank";

type Props = {
  status: BankServerStatus | null;
  busy: boolean;
  /** Runs the save with the tab's busy flag and banners. */
  run: (action: () => Promise<unknown>, fallback: string) => Promise<unknown>;
  onSaved: (message: string) => Promise<unknown>;
};

export function EnableBankingKeys({ status, busy, run, onSaved }: Props) {
  const eb = status?.enablebanking;
  const [appId, setAppId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const ready = Boolean(appId.trim() && privateKey.trim());

  function save() {
    return run(async () => {
      await bank.saveEnableBankingKeys(appId.trim(), privateKey.trim());
      setPrivateKey("");
      await onSaved("Zapisano klucz aplikacji Enable Banking.");
    }, "Nie zapisano klucza");
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Klucz aplikacji Enable Banking</h2>
          <p className="card-sub">Zapisany lokalnie w folderze danych na tym komputerze.</p>
        </div>
        <span className={eb?.hasKeys ? "pill ok" : "pill"}>{eb?.hasKeys ? "zapisany" : "brak"}</span>
      </div>
      <form
        className="key-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void save();
        }}
      >
        <label>
          Application ID
          <input value={appId} placeholder={eb?.appId || "np. 3f1c…-…"} onChange={(e) => setAppId(e.target.value)} autoComplete="off" />
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
                if (file) void file.text().then((text) => setPrivateKey(text.trim()));
                e.target.value = "";
              }}
            />
          </label>
          <button className={eb?.hasKeys ? "ghost" : "primary"} type="submit" disabled={busy || !ready}>
            Zapisz klucz
          </button>
        </div>
      </form>
    </article>
  );
}

export function GoCardlessKeys({ status, busy, run, onSaved }: Props) {
  const gc = status?.gocardless;
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");

  function save() {
    return run(async () => {
      await bank.saveGoCardlessSecrets(secretId.trim(), secretKey.trim());
      setSecretKey("");
      await onSaved("Zapisano klucze GoCardless.");
    }, "Nie zapisano kluczy");
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Klucze GoCardless</h2>
          <p className="card-sub">Zapisane lokalnie w folderze danych na tym komputerze.</p>
        </div>
        <span className={gc?.hasSecrets ? "pill ok" : "pill"}>{gc?.hasSecrets ? "zapisane" : "brak"}</span>
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
          <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="off" />
        </label>
        <button className={gc?.hasSecrets ? "ghost" : "primary"} type="submit" disabled={busy || !secretId || !secretKey}>
          Zapisz klucze
        </button>
      </form>
    </article>
  );
}
