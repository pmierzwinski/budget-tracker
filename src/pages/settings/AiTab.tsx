import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { Icon } from "../../components/Icon";
import { Notices } from "../../components/ui/Notices";
import { plural } from "../../format";
import { useAction } from "../../hooks/useAction";
import { aiCategorizedMessage } from "../../messages";

export function AiTab() {
  const { meta, refreshMeta } = useApp();
  const { hasAiKey, uncategorized } = meta;
  const [aiKey, setAiKey] = useState("");
  const { busy, message, error, setMessage, run } = useAction();

  function saveKey() {
    return run(async () => {
      await api.saveAiKey(aiKey.trim());
      setAiKey("");
      setMessage("Zapisano klucz OpenAI. Przyciski AI działają już na wszystkich ekranach.");
      await refreshMeta();
    }, "Nie zapisano klucza");
  }

  function categorize() {
    return run(async () => {
      setMessage(aiCategorizedMessage(await api.categorizeAi()));
      await refreshMeta();
    }, "Kategoryzacja AI nie powiodła się");
  }

  return (
    <>
      <Notices message={message} error={error} />

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
              <strong>Kategoryzacja</strong> — płatności z Inne, pogrupowane po odbiorcy, trafiają do OpenAI razem z
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
