import { useEffect, useState } from "react";
import { api } from "../api";
import { evaluationKey } from "../format";
import type { Period } from "./PeriodBar";
import type { PeriodEvaluation } from "../types";

export type EvalFilters = {
  category?: string;
  kind?: string;
  minAmount?: string;
  maxAmount?: string;
};

export function AiEvaluationCard({
  period,
  filters,
  disabled,
}: {
  period: Period;
  filters?: EvalFilters;
  disabled?: boolean;
}) {
  const [evaluations, setEvaluations] = useState<PeriodEvaluation[]>([]);
  const [hasAiKey, setHasAiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .evaluations()
      .then((data) => {
        setEvaluations(data.evaluations);
        setHasAiKey(data.hasAiKey);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const scope = evaluationKey(period, filters);
  const current = evaluations.find((row) => row.scope === scope);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const data = await api.evaluatePeriod({
        from: period.from,
        to: period.to,
        category: filters?.category,
        kind: filters?.kind,
        minAmount: filters?.minAmount,
        maxAmount: filters?.maxAmount,
      });
      setEvaluations(data.evaluations);
      setHasAiKey(data.hasAiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocena AI nie powiodła się");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card ai-eval">
      <div className="card-head">
        <h2>Ocena AI</h2>
        <button
          type="button"
          className="primary"
          disabled={busy || disabled || !hasAiKey || !period.from || !period.to}
          onClick={() => void generate()}
        >
          {busy ? "Pytam AI…" : current ? "Oceń ponownie" : "Zapytaj AI o ten widok"}
        </button>
      </div>
      {busy ? (
        <p className="muted">Patrzę na wydatki z tego zakresu i na cały okres, który masz ustawiony.</p>
      ) : current ? (
        <>
          <p className="muted ai-eval-meta">
            {current.label}
            {current.createdAt
              ? ` · ${new Date(current.createdAt).toLocaleString("pl-PL", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`
              : ""}
          </p>
          <p className="ai-eval-text">{current.text}</p>
        </>
      ) : !hasAiKey ? (
        <p className="muted">Żeby zapytać, wklej klucz OpenAI w zakładce Kategorie.</p>
      ) : (
        <p className="muted">
          Kliknij, a AI skomentuje konkretne wydatki i okres, który teraz oglądasz. Jak zmienisz zakres, ten
          komentarz zostaje — dla nowego widoku pytasz znowu.
        </p>
      )}
      {error ? <p className="banner error">{error}</p> : null}
    </article>
  );
}
