import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { bankLabel, type Navigate } from "../components/Layout";
import { Modal } from "../components/Modal";
import type { Account, Bank } from "../types";

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

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".txt") || type.includes("csv") || type === "text/plain";
}

export function ImportPage({
  hosted,
  accounts,
  banks,
  onNavigate,
  onImported,
}: {
  hosted: boolean;
  accounts: Account[];
  banks: Bank[];
  onNavigate: Navigate;
  onImported: (accountId: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [replaceCsv, setReplaceCsv] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [target, setTarget] = useState("auto");
  const [bank, setBank] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBank, setNewBank] = useState("pko");
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const importRef = useRef<(file: File) => void>(() => undefined);

  useEffect(() => {
    api
      .meta()
      .then((meta) => setHasAiKey(Boolean(meta.hasAiKey)))
      .catch(() => undefined);
  }, []);

  const targetAccount = accounts.find((account) => account.id === target);
  const guideBank = bank || targetAccount?.bank || "pko";

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.importFile(file, {
        replaceCsv,
        ai: useAi && hasAiKey,
        account: target,
        bank: bank || targetAccount?.bank || undefined,
      });
      const parts = [
        result.imported ? `Dodano ${result.imported} nowych transakcji` : "Nie dodano nowych transakcji",
        `${result.bankName} → konto „${result.account.name}”`,
      ];
      if (result.skipped) parts.push(`pominięto ${result.skipped} duplikatów (już były w bazie)`);
      if (result.minDate && result.maxDate && result.imported) parts.push(`okres ${result.minDate} – ${result.maxDate}`);
      if (result.ai?.updated) parts.push(`AI skategoryzowało ${result.ai.updated} nowych płatności`);
      setMessage(`${parts.join("; ")}.`);
      setTarget(result.account.id);
      onImported(result.account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import nie powiódł się");
    } finally {
      setBusy(false);
    }
  }

  importRef.current = (file: File) => {
    void handleFile(file);
  };

  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return;

    const resetDrag = () => {
      dragDepth.current = 0;
      setDragging(false);
    };

    const onEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current += 1;
      if (!busyRef.current) setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = busyRef.current ? "none" : "copy";
    };
    const onLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resetDrag();
      if (busyRef.current) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        setError("Nie znaleziono pliku. Upuść plik CSV na to pole.");
        return;
      }
      if (!isCsvFile(file)) {
        setError("To nie wygląda na CSV. Wybierz eksport historii z bankowości (rozszerzenie .csv).");
        return;
      }
      importRef.current(file);
    };

    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, []);

  async function createAccount() {
    const name = newName.trim();
    if (!name) return;
    try {
      const result = await api.createAccount({ name, bank: newBank });
      setCreating(false);
      setNewName("");
      setTarget(result.account.id);
      setBank(result.account.bank === "generic" ? "" : result.account.bank);
      onImported(result.account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie dodano konta");
    }
  }

  async function loadDemo(uncategorized = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api.importDemo({ uncategorized });
      setMessage(
        `Dodano „${result.account.name}” z ${result.imported} przykładowymi płatnościami z ostatnich 6 miesięcy${
          uncategorized ? " — wszystkie w „Inne”" : ""
        }. Usuniesz je w Ustawienia → Konta.`,
      );
      onImported(result.account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wczytać przykładu");
    } finally {
      setBusy(false);
    }
  }

  async function clear(all: boolean) {
    const question = all
      ? "Usunąć transakcje, konta, kategorie własne i reguły?"
      : "Usunąć wszystkie transakcje? Konta, kategorie i reguły zostaną.";
    if (!confirm(question)) return;
    setError("");
    try {
      await api.clear(all);
      setMessage(all ? "Wyczyszczono całą lokalną bazę wydatków." : "Wyczyszczono transakcje.");
      onImported("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wyczyścić danych");
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Import wyciągu</h1>
        </div>
      </header>

      {hosted ? (
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
                    setNewBank(bank || "pko");
                    setCreating(true);
                    return;
                  }
                  setTarget(e.target.value);
                }}
              >
                <option value="auto">Wykryj automatycznie</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {bankLabel(banks, account.bank)}
                  </option>
                ))}
                <option value="__new">+ Nowe konto…</option>
              </select>
            </label>
            <label className="field">
              Bank
              <select value={bank} onChange={(e) => setBank(e.target.value)}>
                <option value="">Rozpoznaj z pliku</option>
                {banks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
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
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <span className="drop-icon">
              <Icon name="upload" size={26} />
            </span>
            <strong>{busy ? "Importuję…" : dragging ? "Upuść plik tutaj" : "Upuść plik CSV z bankowości"}</strong>
            <span>
              albo <u>kliknij, żeby wybrać</u> · {banks.filter((item) => item.id !== "generic").map((item) => item.name).join(", ")}
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
                    Wymaga klucza OpenAI —{" "}
                    <button type="button" className="link-btn" onClick={() => onNavigate("settings", "ai")}>
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

          {message ? (
            <div className="banner ok with-action">
              <span>{message}</span>
              <button className="primary sm" type="button" onClick={() => onNavigate("transactions")}>
                Zobacz płatności
              </button>
            </div>
          ) : null}
          {error ? <p className="banner error">{error}</p> : null}
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

      <Modal
        open={creating}
        title="Nowe konto"
        eyebrow="Import"
        onClose={() => setCreating(false)}
        onSubmit={() => void createAccount()}
        footer={
          <>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>
              Anuluj
            </button>
            <button type="submit" className="primary" disabled={!newName.trim()}>
              Dodaj konto
            </button>
          </>
        }
      >
        <label className="field">
          Nazwa
          <input
            autoFocus
            maxLength={60}
            value={newName}
            placeholder="np. mBank wspólne, ING oszczędności"
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <label className="field">
          Bank
          <select value={newBank} onChange={(e) => setNewBank(e.target.value)}>
            {banks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </section>
  );
}
