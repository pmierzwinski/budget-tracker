import { useEffect, useState } from "react";
import { AI_PROVIDERS, aiProvider, type AiModelOption, type AiProviderId } from "../../modules/shared/ai.ts";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { Icon } from "../../components/Icon";
import { Notices } from "../../components/ui/Notices";
import { Segmented } from "../../components/ui/Segmented";
import { errorMessage, plural } from "../../format";
import { useAction } from "../../hooks/useAction";
import { aiCategorizedMessage } from "../../messages";

export function AiTab() {
  const { meta, refreshMeta } = useApp();
  const { hasAiKey, uncategorized, ai } = meta;
  const [provider, setProvider] = useState<AiProviderId>(ai.provider);
  const [aiKey, setAiKey] = useState("");
  const [model, setModel] = useState(ai.model);
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const { busy, message, error, setMessage, run } = useAction();
  const info = aiProvider(provider);
  const canSave = Boolean(aiKey.trim() || hasAiKey);
  const canSaveCompatible = provider !== "compatible" || Boolean(baseUrl.trim());
  const typedKey = aiKey.trim();
  const canList =
    Boolean(typedKey || (hasAiKey && provider === ai.provider)) &&
    (provider !== "compatible" || Boolean(baseUrl.trim() || (provider === ai.provider && ai.baseUrl)));
  const modelOptions =
    models.length && model && !models.some((item) => item.id === model)
      ? [{ id: model, name: `${model} (zapisany)` }, ...models]
      : models;

  useEffect(() => {
    if (!canList) {
      setModels([]);
      setModelsError("");
      setModelsLoading(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(
      () => {
        setModelsLoading(true);
        api
          .listAiModels({
            provider,
            apiKey: typedKey || undefined,
            baseUrl: baseUrl.trim() || undefined,
          })
          .then((result) => {
            if (!alive) return;
            setModels(result.models);
            setModelsError("");
            if (result.models.length) {
              setModel((current) => (result.models.some((item) => item.id === current) ? current : result.selected));
            }
          })
          .catch((err) => {
            if (!alive) return;
            setModels([]);
            setModelsError(errorMessage(err, "Nie pobrano listy modeli"));
          })
          .finally(() => {
            if (alive) setModelsLoading(false);
          });
      },
      typedKey ? 400 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [provider, typedKey, baseUrl, hasAiKey, canList]);

  function saveKey() {
    return run(async () => {
      await api.saveAiKey({
        provider,
        apiKey: aiKey.trim() || undefined,
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      });
      setAiKey("");
      setMessage(`Zapisano ustawienia ${info.label}. Przyciski AI działają już na wszystkich ekranach.`);
      await refreshMeta();
    }, "Nie zapisano ustawień AI");
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
                Klucz AI
              </h2>
              <p className="card-sub">Zapisany lokalnie w bazie na tym komputerze. Ma pierwszeństwo przed .env.</p>
            </div>
            <span className={hasAiKey ? "pill ok" : "pill"}>
              {hasAiKey ? `${aiProvider(ai.provider).label} · klucz zapisany` : "brak klucza"}
            </span>
          </div>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSave && canSaveCompatible) void saveKey();
            }}
          >
            <Segmented
              label="Dostawca AI"
              options={AI_PROVIDERS.map((item) => ({ id: item.id, label: item.label }))}
              value={provider}
              onChange={(next) => {
                setProvider(next);
                setModel(aiProvider(next).defaultModel);
                setModels([]);
                setModelsError("");
                if (next !== "compatible") setBaseUrl("");
              }}
            />
            <label className="field">
              Klucz API
              <input
                type="password"
                aria-label="Klucz API"
                autoComplete="off"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder={hasAiKey ? "Wklej nowy klucz, żeby zmienić" : info.keyHint}
              />
            </label>
            <label className="field">
              Model
              {modelOptions.length ? (
                <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)}>
                  {modelOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name === item.id ? item.id : `${item.name} (${item.id})`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={modelsLoading && canList ? "Pobieram listę…" : info.defaultModel || "nazwa modelu"}
                />
              )}
            </label>
            {modelsLoading && canList ? <p className="field-hint">Pobieram listę modeli z API…</p> : null}
            {modelsError ? <p className="field-hint warn">{modelsError}. Możesz wpisać model ręcznie.</p> : null}
            {!canList && provider !== "compatible" ? (
              <p className="field-hint">Po wklejeniu klucza lista modeli pobierze się sama.</p>
            ) : null}
            {provider === "compatible" ? (
              <label className="field">
                Adres API
                <input
                  aria-label="Adres API"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </label>
            ) : null}
            <div className="row">
              <button className={hasAiKey ? "ghost" : "primary"} type="submit" disabled={!canSave || !canSaveCompatible}>
                Zapisz
              </button>
            </div>
          </form>
          <p className="card-foot">
            {info.docsUrl ? (
              <>
                Klucz utworzysz na{" "}
                <a href={info.docsUrl} target="_blank" rel="noreferrer">
                  {info.docsLabel}
                </a>
                .{" "}
              </>
            ) : (
              "Podaj adres zgodny z OpenAI (Ollama, Groq, Mistral, Azure…). "
            )}
            Kategoryzacja kilkuset płatności kosztuje zwykle ułamek centa — Gemini ma też darmowy limit.
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
              <strong>Kategoryzacja</strong> — płatności z Inne, pogrupowane po odbiorcy, trafiają do modelu razem z
              listą kategorii. Wynik zapisuje się jako reguły, więc kolejne importy łapią się już bez AI.
            </li>
            <li>
              <strong>Ocena okresu</strong> — główny wydatek, wydatki poza stałymi, co uciąć i to, czego nie widać
              na pierwszy rzut oka.
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
