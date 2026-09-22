import { useEffect, useRef, useState } from "react";
import { api } from "../api";

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

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="eyebrow">Wyciąg z iPKO</p>
          <h1>Import CSV</h1>
        </div>
      </header>

      <div className="grid-2">
        <article className="card">
          <h2>Jak pobrać historię z PKO</h2>
          <ol className="steps">
            <li>Zaloguj się do <strong>iPKO</strong>.</li>
            <li>Wejdź w konto → <strong>Historia operacji</strong>.</li>
            <li>Ustaw zakres dat i kliknij <strong>Pobierz / CSV</strong>.</li>
            <li>Wgraj plik tutaj. Aplikacja rozpozna kolumny i pominie duplikaty.</li>
          </ol>
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
            <strong>
              {busy ? "Importuję…" : dragging ? "Upuść plik tutaj" : "Upuść plik CSV albo kliknij, żeby wybrać"}
            </strong>
            <span>Obsługiwane są wyciągi iPKO (średnik lub przecinek, UTF-8 / Windows-1250).</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={replaceCsv} onChange={(e) => setReplaceCsv(e.target.checked)} />
            Zastąp poprzedni import CSV (kasuje stare wpisy z CSV i wczytuje plik od nowa)
          </label>
          <label className="check">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            Po imporcie skategoryzuj nowe płatności przez AI
          </label>
          {message && (
            <>
              <p className="banner ok">{message}</p>
              {onImported ? (
                <button className="ghost" type="button" onClick={onImported}>
                  Przejdź do płatności
                </button>
              ) : null}
            </>
          )}
          {error && <p className="banner error">{error}</p>}
        </article>

        <article className="card">
          <h2>Duplikaty i czyszczenie</h2>
          <p>
            Drugi import tego samego pliku <strong>nie doda transakcji drugi raz</strong>. Porównanie idzie po dacie,
            kwocie, odbiorcy i opisie. Istniejące kategorie zostają.
          </p>
          <p>
            Jeśli chcesz najpierw zobaczyć aplikację, wczytaj przykładowe transakcje (Biedronka, Orlen, czynsz,
            wynagrodzenie).
          </p>
          <div className="row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
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
              }}
            >
              Wczytaj dane przykładowe
            </button>
          </div>
          <div className="row" style={{ marginTop: "0.8rem" }}>
            <button
              className="ghost danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Usunąć wszystkie transakcje? Kategorie i reguły zostaną.")) return;
                await api.clear(false);
                setMessage("Wyczyszczono transakcje.");
              }}
            >
              Wyczyść transakcje
            </button>
            <button
              className="ghost danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Usunąć transakcje, kategorie własne i reguły?")) return;
                await api.clear(true);
                setMessage("Wyczyszczono całą lokalną bazę wydatków.");
              }}
            >
              Wyczyść wszystko
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
