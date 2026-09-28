import { useEffect, useState } from "react";
import { api } from "../../api";
import { Icon } from "../../components/Icon";
import { plural } from "../../format";

export function AiTab() {
  const [aiKey, setAiKey] = useState("");
  const [hasAiKey, setHasAiKey] = useState(false);
  const [uncategorized, setUncategorized] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const meta = await api.meta();
    setHasAiKey(Boolean(meta.hasAiKey));
    setUncategorized(meta.uncategorized || 0);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  async function saveKey() {
    setError("");
    try {
      const result = await api.saveAiKey(aiKey.trim());
      setHasAiKey(result.hasAiKey);
      setAiKey("");
      setMessage("Zapisano klucz OpenAI. Przyciski AI działają już na wszystkich ekranach.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie zapisano klucza");
    }
  }

  async function categorize() {
    setBusy(true);
    setError("");
    try {
      const result = await api.categorizeAi();
      setMessage(
        result.updated
          ? `AI ustawiło kategorię dla ${result.updated} płatności (${result.groups} pośredników). Zostało ${result.remaining} jako Inne.`
          : "AI nie zmieniło kategorii — nic nie pasowało do istniejących kategorii.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategoryzacja AI nie powiodła się");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message ? <p className="banner ok">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

      <div className="split">
        <article className="card">
          <div className="card-head">
            <div>
              <h2 className="with-icon">
                <Icon name="sparkle" size={16} />
                Klucz OpenAI
              </h2>
              <p className="card-sub">Zapisany lokalnie w bazie na tym komputerze. Ma pierwszeństwo przed .env.</p>
            </div>
            <span className={hasAiKey ? "pill ok" : "pill"}>{hasAiKey ? "klucz zapisany" : "brak klucza"}</span>
          </div>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (aiKey.trim()) void saveKey();
            }}
          >
            <input
              type="password"
              aria-label="Klucz OpenAI"
              autoComplete="off"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={hasAiKey ? "Wklej nowy klucz, żeby zmienić" : "sk-..."}
            />
            <button className={hasAiKey ? "ghost" : "primary"} type="submit" disabled={!aiKey.trim()}>
              Zapisz klucz
            </button>
          </form>
          <p className="card-foot">
            Klucz utworzysz na{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              platform.openai.com/api-keys
            </a>
            . Kategoryzacja kilkuset płatności kosztuje zwykle ułamek centa.
          </p>
        </article>

        <article className="card">
          <div className="card-head">
            <div>
              <h2>Co robi AI</h2>
              <p className="card-sub">Tylko na Twoje kliknięcie — nic nie wysyła się samo.</p>
            </div>
          </div>
          <ul className="feature-list">
            <li>
              <strong>Kategoryzacja</strong> — płatności z Inne, pogrupowane po pośredniku, trafiają do OpenAI razem z
              listą kategorii. Wynik zapisuje się jako reguły, więc kolejne importy łapią się już bez AI.
            </li>
            <li>
              <strong>Ocena okresu</strong> — kilka zdań o wybranym okresie na Przeglądzie i w Statystykach.
            </li>
          </ul>
          <div className="ai-run">
            <p>
              <strong>{uncategorized}</strong> {plural(uncategorized, "płatność", "płatności", "płatności")} w Inne
            </p>
            <button
              className="primary"
              type="button"
              disabled={busy || !uncategorized || !hasAiKey}
              title={hasAiKey ? undefined : "Najpierw zapisz klucz"}
              onClick={() => void categorize()}
            >
              <Icon name="sparkle" size={16} />
              {busy ? "Kategoryzuję…" : "Skategoryzuj przez AI"}
            </button>
          </div>
        </article>
      </div>
    </>
  );
}
