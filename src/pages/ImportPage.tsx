import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Icon } from "../components/Icon";

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".csv") || type.includes("csv") || type === "text/csv";
}

export function ImportPage({ onImported }: { onImported?: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [replaceCsv, setReplaceCsv] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const importRef = useRef<(file: File) => void>(() => undefined);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.importFile(file, { replaceCsv, ai: useAi });
      const parts = [
        result.imported
          ? `Dodano ${result.imported} nowych transakcji`
          : "Nie dodano nowych transakcji",
      ];
      if (result.skipped) {
        parts.push(`pominięto ${result.skipped} duplikatów (już były w bazie)`);
      }
      if (result.minDate && result.maxDate && result.imported) {
        parts.push(`okres ${result.minDate} – ${result.maxDate}`);
      }
      if (result.ai?.updated) {
        parts.push(`AI skategoryzowało ${result.ai.updated} nowych płatności`);
      }
      setMessage(`${parts.join("; ")}.`);
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
        setError("To nie wygląda na CSV. Wybierz plik z iPKO (rozszerzenie .csv).");
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

  async function loadDemo() {
    setBusy(true);
    setError("");
    try {
      const result = await api.importDemo();
      setMessage(
        result.imported
          ? `Wczytano przykład: ${result.imported} operacji.`
          : `Przykład już jest w bazie (pominięto ${result.skipped} duplikatów).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wczytać przykładu");
    } finally {
      setBusy(false);
    }
  }

  async function clear(all: boolean) {
    const question = all
      ? "Usunąć transakcje, kategorie własne i reguły?"
      : "Usunąć wszystkie transakcje? Kategorie i reguły zostaną.";
    if (!confirm(question)) return;
    setError("");
    try {
      await api.clear(all);
      setMessage(all ? "Wyczyszczono całą lokalną bazę wydatków." : "Wyczyszczono transakcje.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wyczyścić danych");
    }
  }

  return (
    <section className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dane</p>
          <h1>Import z iPKO</h1>
        </div>
      </header>

      <div className="split">
        <article className="card">
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
              accept=".csv,text/csv"
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
            <strong>{busy ? "Importuję…" : dragging ? "Upuść plik tutaj" : "Upuść plik CSV z iPKO"}</strong>
            <span>
              albo <u>kliknij, żeby wybrać</u> · średnik lub przecinek, UTF-8 / Windows-1250
            </span>
          </div>

          <div className="drop-options">
            <label className="check">
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              <span>
                Skategoryzuj nowe płatności przez AI
                <small>od razu po imporcie, tylko to, co trafi do Inne</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={replaceCsv} onChange={(e) => setReplaceCsv(e.target.checked)} />
              <span>
                Zastąp poprzedni import CSV
                <small>kasuje stare wpisy z CSV i wczytuje plik od nowa</small>
              </span>
            </label>
          </div>

          {message ? (
            <div className="banner ok with-action">
              <span>{message}</span>
              {onImported ? (
                <button className="primary sm" type="button" onClick={onImported}>
                  Zobacz płatności
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="banner error">{error}</p> : null}
          <p className="card-foot">
            Ten sam plik możesz wgrać drugi raz — duplikaty są pomijane (data, kwota, odbiorca, opis), a kategorie
            zostają.
          </p>
        </article>

        <div className="stack">
          <article className="card">
            <h2>Skąd wziąć plik</h2>
            <ol className="steps">
              <li>
                Zaloguj się do <strong>iPKO</strong>.
              </li>
              <li>
                Konto → <strong>Historia operacji</strong>.
              </li>
              <li>
                Ustaw zakres dat → <strong>Pobierz / CSV</strong>.
              </li>
              <li>Upuść plik w polu obok.</li>
            </ol>
          </article>

          <article className="card">
            <h2>Chcesz tylko popatrzeć?</h2>
            <p className="muted">Przykładowe transakcje: Biedronka, Orlen, czynsz, wynagrodzenie.</p>
            <button className="ghost" type="button" disabled={busy} onClick={() => void loadDemo()}>
              <Icon name="file" size={16} />
              Wczytaj dane przykładowe
            </button>
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
    </section>
  );
}
