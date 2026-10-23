import { useEffect, useState } from "react";
import type { ImportPreview } from "../../../shared/types";
import { getContext } from "../../app/AppContext";
import { BankSelect, NewAccountDialog } from "../../modules/accounts";
import { clearData, importDemo, importFile, previewImport, type ImportOptions } from "../../modules/import";
import { usePlatform } from "../../platform";
import { Notices } from "../../ui/Notices";
import { bankLabel, errorMessage } from "../../lib/format";
import { useAction } from "../../lib/useAction";
import { demoAddedMessage } from "../../lib/messages";
import { FileDrop } from "./FileDrop";
import { ImportPreviewCard } from "./ImportPreviewCard";
import { ClearCard, DemoCard, HowToCard } from "./SideCards";
import "./import.css";
import "./import-target.css";

export function ImportPage() {
  const { database, env, meta, account, chooseAccount, navigate } = getContext();
  const { accounts, banks, hasAiKey } = meta;
  const { onDevice } = usePlatform();
  const { busy, message, error, setMessage, setError, run } = useAction();
  const [replaceCsv, setReplaceCsv] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [target, setTarget] = useState("auto");
  const [bank, setBank] = useState("");
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const targetAccount = accounts.find((row) => row.id === target);
  const options: ImportOptions = { replaceCsv, account: target, bank: bank || targetAccount?.bank || undefined };
  const optionsKey = JSON.stringify(options);
  const withAi = useAi && hasAiKey;

  useEffect(() => {
    if (!file) return;
    let current = true;
    setPreview(null);
    setError("");
    previewImport(database, file, JSON.parse(optionsKey) as ImportOptions)
      .then((result) => current && setPreview(result))
      .catch((err) => {
        if (!current) return;
        setError(errorMessage(err, "Nie udało się odczytać pliku"));
        setFile(null);
      });
    return () => {
      current = false;
    };
  }, [file, optionsKey, setError]);

  /** New data landed on `accountId`: follow it when another account is active. */
  function imported(accountId: string) {
    if (account && accountId !== account) chooseAccount(accountId);
  }

  function chooseFile(next: File) {
    setMessage("");
    setFile(next);
  }

  function cancel() {
    setFile(null);
    setPreview(null);
  }

  function confirmImport() {
    if (!file) return;
    return run(async () => {
      const result = await importFile(database, env, file, { ...options, ai: withAi });
      cancel();
      const parts = [
        result.imported ? `Dodano ${result.imported} nowych transakcji` : "Nie dodano nowych transakcji",
        `${result.bankName} → konto „${result.account.name}”`,
      ];
      if (result.skipped) parts.push(`pominięto ${result.skipped} duplikatów (już były w bazie)`);
      if (result.minDate && result.maxDate && result.imported) parts.push(`okres ${result.minDate} – ${result.maxDate}`);
      if (result.ai?.updated) parts.push(`AI skategoryzowało ${result.ai.updated} nowych płatności`);
      setMessage(`${parts.join("; ")}.`);
      setTarget(result.account.id);
      imported(result.account.id);
    }, "Import nie powiódł się");
  }

  function loadDemo(uncategorized: boolean) {
    return run(async () => {
      const result = await importDemo(database, { uncategorized });
      setMessage(`${demoAddedMessage(result, uncategorized)} Usuniesz je w Ustawienia → Konta.`);
      imported(result.account.id);
    }, "Nie udało się wczytać przykładu");
  }

  function clear(all: boolean) {
    const question = all
      ? "Usunąć transakcje, konta, własne kategorie, reguły i limity? Wrócą tylko wbudowane kategorie."
      : "Usunąć wszystkie transakcje? Konta, kategorie i reguły zostaną.";
    if (!confirm(question)) return;
    return run(async () => {
      await database.update((draft) => clearData(draft, all));
      setMessage(all ? "Wyczyszczono bazę. Zostały tylko wbudowane kategorie." : "Wyczyszczono transakcje.");
      imported("");
    }, "Nie udało się wyczyścić danych");
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Import wyciągu</h1>
        </div>
      </header>

      {onDevice ? (
        <p className="banner ok">Plik jest czytany na tym urządzeniu i nigdzie nie jest wysyłany — płatności zapisują się tylko tutaj.</p>
      ) : null}

      <div className="split">
        <article className="card">
          <div className="import-target">
            <label className="field">
              Konto
              <select
                value={target}
                onChange={(e) => (e.target.value === "__new" ? setCreating(true) : setTarget(e.target.value))}
              >
                <option value="auto">Wykryj automatycznie</option>
                {accounts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {bankLabel(banks, row.bank)}
                  </option>
                ))}
                <option value="__new">+ Nowe konto…</option>
              </select>
            </label>
            <label className="field">
              Bank
              <BankSelect value={bank} onChange={setBank} banks={banks} detectOption="Rozpoznaj z pliku" />
            </label>
          </div>
          <p className="field-hint">
            {target === "auto"
              ? "Plik trafi na konto z tym samym numerem rachunku albo tego samego banku; jeśli takiego nie ma, powstanie nowe."
              : `Płatności trafią na konto „${targetAccount?.name}”.`}
          </p>

          <FileDrop file={file} busy={busy} banks={banks} onFile={chooseFile} onError={setError} />

          <div className="drop-options">
            <label className={hasAiKey ? "check" : "check disabled"}>
              <input type="checkbox" checked={withAi} disabled={!hasAiKey} onChange={(e) => setUseAi(e.target.checked)} />
              <span>
                Skategoryzuj nowe płatności przez AI
                {hasAiKey ? (
                  <small>od razu po imporcie, tylko to, co trafi do Inne</small>
                ) : (
                  <small>
                    Wymaga klucza AI —{" "}
                    <button type="button" className="link-btn" onClick={() => navigate("settings", "ai")}>
                      ustaw klucz AI
                    </button>
                  </small>
                )}
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={replaceCsv} onChange={(e) => setReplaceCsv(e.target.checked)} />
              <span>
                Zastąp poprzedni import CSV na tym koncie
                <small>kasuje stare wpisy z CSV tego konta i wczytuje plik od nowa</small>
              </span>
            </label>
          </div>

          {file ? (
            <ImportPreviewCard preview={preview} busy={busy} withAi={withAi} onConfirm={() => void confirmImport()} onCancel={cancel} />
          ) : null}

          {message ? (
            <div className="banner ok with-action">
              <span>{message}</span>
              <button className="primary sm" type="button" onClick={() => navigate("transactions")}>
                Zobacz płatności
              </button>
            </div>
          ) : null}
          <Notices error={error} />
          <p className="card-foot">
            Ten sam plik możesz wgrać drugi raz — duplikaty są pomijane (data, kwota, odbiorca, opis), a kategorie zostają. Jeśli
            plik z Twojego banku się nie wczyta, wybierz bank ręcznie.
          </p>
        </article>

        <div className="stack">
          <HowToCard bank={bank || targetAccount?.bank || "pko"} banks={banks} />
          <DemoCard busy={busy} onDemo={(uncategorized) => void loadDemo(uncategorized)} />
          <ClearCard busy={busy} onClear={(all) => void clear(all)} />
        </div>
      </div>

      <NewAccountDialog
        open={creating}
        eyebrow="Import"
        defaultBank={bank || "pko"}
        onClose={() => setCreating(false)}
        onError={setError}
        onCreated={(created) => {
          setCreating(false);
          setTarget(created.id);
          setBank(created.bank === "generic" ? "" : created.bank);
          imported(created.id);
        }}
      />
    </section>
  );
}
