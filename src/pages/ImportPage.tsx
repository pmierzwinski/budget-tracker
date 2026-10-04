import { useEffect, useRef, useState } from "react";
import { api, type ImportOptions } from "../api";
import { useApp } from "../app/AppContext";
import { Icon } from "../components/Icon";
import { BankSelect, NewAccountDialog } from "../components/NewAccountDialog";
import { Notices } from "../components/ui/Notices";
import { bankLabel, errorMessage, formatDay, plural } from "../format";
import { useAction } from "../hooks/useAction";
import { useFileDrop } from "../hooks/useFileDrop";
import { demoAddedMessage } from "../messages";
import type { ImportPreview } from "../types";

const HOW_TO: Record<string, string[]> = {
  pko: ["Zaloguj się do iPKO.", "Konto → Historia operacji.", "Ustaw zakres dat → Pobierz → CSV."],
  mbank: ["Zaloguj się do mBanku.", "Historia → ustaw zakres dat.", "Pobierz → CSV."],
  ing: ["Zaloguj się do Moje ING.", "Historia → ustaw zakres dat.", "Pobierz → CSV."],
  santander: ["Zaloguj się do Santander internet.", "Konto → Historia.", "Eksportuj → CSV."],
  pekao: ["Zaloguj się do Pekao24.", "Historia rachunku → zakres dat.", "Eksport → CSV."],
  millennium: ["Zaloguj się do Millenetu.", "Historia transakcji → zakres dat.", "Eksportuj → CSV."],
  alior: ["Zaloguj się do Alior Online.", "Historia → zakres dat.", "Pobierz → CSV."],
  revolut: ["W aplikacji Revolut: Konto → Wyciągi.", "Wybierz Excel/CSV i zakres dat.", "Prześlij plik na komputer."],
  credit_agricole: ["Zaloguj się do CA24.", "Historia operacji → zakres dat.", "Eksport → CSV."],
};

export function ImportPage() {
  const { meta, refreshMeta, account, chooseAccount, navigate } = useApp();
  const { accounts, banks, hasAiKey } = meta;
  const { busy, message, error, setMessage, setError, run } = useAction();
  const [replaceCsv, setReplaceCsv] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [target, setTarget] = useState("auto");
  const [bank, setBank] = useState("");
  const [creating, setCreating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const targetAccount = accounts.find((row) => row.id === target);
  const guideBank = bank || targetAccount?.bank || "pko";

  /** New data landed on `accountId`: refresh the app and follow it when another account is active. */
  async function imported(accountId: string) {
    await refreshMeta();
    if (account && accountId !== account) chooseAccount(accountId);
  }

  const options: ImportOptions = { replaceCsv, account: target, bank: bank || targetAccount?.bank || undefined };
  const optionsKey = JSON.stringify(options);
  const rest = preview ? preview.fresh - preview.categorized : 0;

  useEffect(() => {
    if (!file) return;
    let current = true;
    setPreview(null);
    setPreviewing(true);
    setError("");
    api
      .previewImport(file, JSON.parse(optionsKey) as ImportOptions)
      .then((result) => {
        if (current) setPreview(result);
      })
      .catch((err) => {
        if (!current) return;
        setError(errorMessage(err, "Nie udało się odczytać pliku"));
        setFile(null);
      })
      .finally(() => {
        if (current) setPreviewing(false);
      });
    return () => {
      current = false;
    };
  }, [file, optionsKey, setError]);

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
      const result = await api.importFile(file, { ...options, ai: useAi && hasAiKey });
      setFile(null);
      setPreview(null);
      const parts = [
        result.imported ? `Dodano ${result.imported} nowych transakcji` : "Nie dodano nowych transakcji",
        `${result.bankName} → konto „${result.account.name}”`,
      ];
      if (result.skipped) parts.push(`pominięto ${result.skipped} duplikatów (już były w bazie)`);
      if (result.minDate && result.maxDate && result.imported) parts.push(`okres ${result.minDate} – ${result.maxDate}`);
      if (result.ai?.updated) parts.push(`AI skategoryzowało ${result.ai.updated} nowych płatności`);
      setMessage(`${parts.join("; ")}.`);
      setTarget(result.account.id);
      await imported(result.account.id);
    }, "Import nie powiódł się");
  }

  const dragging = useFileDrop(zoneRef, { busy, onFile: chooseFile, onError: setError });

  function loadDemo(uncategorized = false) {
    return run(async () => {
      const result = await api.importDemo({ uncategorized });
      setMessage(`${demoAddedMessage(result, uncategorized)} Usuniesz je w Ustawienia → Konta.`);
      await imported(result.account.id);
    }, "Nie udało się wczytać przykładu");
  }

  async function clear(all: boolean) {
    const question = all
      ? "Usunąć transakcje, konta, własne kategorie, reguły i limity? Wrócą tylko wbudowane kategorie."
      : "Usunąć wszystkie transakcje? Konta, kategorie i reguły zostaną.";
    if (!confirm(question)) return;
    await run(async () => {
      await api.clear(all);
      setMessage(all ? "Wyczyszczono bazę. Zostały tylko wbudowane kategorie." : "Wyczyszczono transakcje.");
      await imported("");
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

      {meta.app.hosted ? (
        <p className="banner ok">
          Wersja online: plik trafia tylko do Twojej tymczasowej sesji (znika po dobie bez aktywności) i nikt inny go nie
          widzi. Jeśli nie chcesz wysyłać wyciągu na serwer, pobierz aplikację — działa w całości na Twoim komputerze.
        </p>
      ) : null}

      <div className="split">
        <article className="card">
          <div className="import-target">
            <label className="field">
              Konto
              <select
                value={target}
                onChange={(e) => {
                  if (e.target.value === "__new") {
                    setCreating(true);
                    return;
                  }
                  setTarget(e.target.value);
                }}
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

          <div
            ref={zoneRef}
            className={`drop ${busy ? "disabled" : ""} ${dragging ? "over" : ""}`}
            role="button"
            tabIndex={busy ? -1 : 0}
            onClick={() => {
              if (!busy) inputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (!busy && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,text/csv"
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) chooseFile(file);
                e.target.value = "";
              }}
            />
            <span className="drop-icon">
              <Icon name="upload" size={26} />
            </span>
            <strong>
              {busy
                ? "Importuję…"
                : dragging
                  ? "Upuść plik tutaj"
                  : file
                    ? file.name
                    : "Upuść plik CSV z bankowości"}
            </strong>
            <span>
              {file ? (
                <>
                  <u>wybierz inny plik</u> albo upuść go tutaj
                </>
              ) : (
                <>
                  albo <u>kliknij, żeby wybrać</u> ·{" "}
                  {banks.filter((item) => item.id !== "generic").map((item) => item.name).join(", ")}
                </>
              )}
            </span>
          </div>

          <div className="drop-options">
            <label className={hasAiKey ? "check" : "check disabled"}>
              <input
                type="checkbox"
                checked={useAi && hasAiKey}
                disabled={!hasAiKey}
                onChange={(e) => setUseAi(e.target.checked)}
              />
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
            <div className="import-preview" aria-live="polite">
              {preview ? (
                <>
                  <p className="import-preview-title">
                    <Icon name="check" size={18} />
                    Odczytano {preview.total} {plural(preview.total, "płatność", "płatności", "płatności")} ·{" "}
                    {preview.bankName}
                    {preview.minDate ? ` · ${formatDay(preview.minDate)} – ${formatDay(preview.maxDate)}` : ""}
                  </p>
                  <ul className="import-preview-facts">
                    <li>
                      <strong>{preview.fresh}</strong> {plural(preview.fresh, "nowa", "nowe", "nowych")}
                      {preview.duplicates ? `, ${preview.duplicates} już jest w bazie (pominę)` : ""}
                    </li>
                    <li>
                      {preview.account.id
                        ? `Trafią na konto „${preview.account.name}”`
                        : `Powstanie nowe konto „${preview.account.name}”`}
                    </li>
                    {preview.fresh ? (
                      <li>
                        <strong>{preview.categorized}</strong> z nowych dostanie kategorię od razu (Twoje reguły i wbudowane
                        wzorce, np. Biedronka → Spożywcze)
                        {rest
                          ? useAi && hasAiKey
                            ? `; ${rest} ${plural(rest, "pozostałą", "pozostałe", "pozostałych")} skategoryzuje AI`
                            : `; ${rest} ${plural(rest, "pozostała trafi", "pozostałe trafią", "pozostałych trafi")} do „Inne”`
                          : ""}
                      </li>
                    ) : null}
                  </ul>
                  <div className="row">
                    <button
                      className="primary"
                      type="button"
                      disabled={busy || !preview.fresh}
                      onClick={() => void confirmImport()}
                    >
                      <Icon name="upload" size={16} />
                      {busy
                        ? "Importuję…"
                        : preview.fresh
                          ? `Importuj ${preview.fresh} ${plural(preview.fresh, "płatność", "płatności", "płatności")}`
                          : "Nic nowego do zaimportowania"}
                    </button>
                    <button className="ghost" type="button" disabled={busy} onClick={cancel}>
                      Anuluj
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">{previewing ? "Czytam plik…" : ""}</p>
              )}
            </div>
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
            Ten sam plik możesz wgrać drugi raz — duplikaty są pomijane (data, kwota, odbiorca, opis), a kategorie
            zostają. Jeśli plik z Twojego banku się nie wczyta, wybierz bank ręcznie.
          </p>
        </article>

        <div className="stack">
          <article className="card">
            <h2>Skąd wziąć plik · {bankLabel(banks, guideBank)}</h2>
            <ol className="steps">
              {(HOW_TO[guideBank] || ["Zaloguj się do bankowości.", "Otwórz historię rachunku.", "Wyeksportuj ją do CSV."]).map(
                (step) => (
                  <li key={step}>{step}</li>
                ),
              )}
              <li>Upuść plik w polu obok.</li>
            </ol>
            <p className="card-foot">Nazwy przycisków różnią się między wersjami bankowości — szukaj eksportu historii do CSV.</p>
          </article>

          <article className="card">
            <h2>Chcesz tylko popatrzeć?</h2>
            <p className="muted">
              Osobne „Konto testowe” z 6 miesiącami przykładowych płatności: zakupy, paliwo, czynsz, subskrypcje,
              wynagrodzenie. Twoje dane zostają bez zmian.
            </p>
            <div className="row">
              <button className="ghost" type="button" disabled={busy} onClick={() => void loadDemo()}>
                <Icon name="file" size={16} />
                Dodaj konto testowe
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy}
                title="Wszystkie płatności w „Inne” — do przetestowania kategoryzacji, reguł i AI"
                onClick={() => void loadDemo(true)}
              >
                Dodaj bez kategorii
              </button>
            </div>
          </article>

          <article className="card danger-zone">
            <h2>Czyszczenie bazy</h2>
            <p className="muted">Nie da się tego cofnąć.</p>
            <div className="row">
              <button className="ghost danger" type="button" disabled={busy} onClick={() => void clear(false)}>
                Wyczyść transakcje
              </button>
              <button className="ghost danger" type="button" disabled={busy} onClick={() => void clear(true)}>
                Wyczyść wszystko
              </button>
            </div>
          </article>
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
          void imported(created.id);
        }}
      />
    </section>
  );
}
