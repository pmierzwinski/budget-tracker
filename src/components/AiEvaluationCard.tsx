import { useEffect, useRef, useState } from "react";
import { api, getActiveAccount } from "../api";
import { evaluationKey } from "../format";
import { Icon } from "./Icon";
import type { Period } from "./PeriodBar";
import type { PeriodEvaluation } from "../types";

export type EvalFilters = {
  category?: string;
  kind?: string;
  minAmount?: string;
  maxAmount?: string;
};

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function Badge() {
  return (
    <span className="ai-badge">
      <Icon name="sparkle" size={15} />
      Ocena AI
    </span>
  );
}

export function AiEvaluation({
  period,
  filters,
  disabled,
  onSetup,
  variant = "panel",
}: {
  period: Period;
  filters?: EvalFilters;
  disabled?: boolean;
  onSetup?: () => void;
  variant?: "panel" | "strip";
}) {
  const [evaluations, setEvaluations] = useState<PeriodEvaluation[]>([]);
  const [hasAiKey, setHasAiKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    api
      .evaluations()
      .then((data) => {
        setEvaluations(data.evaluations);
        setHasAiKey(data.hasAiKey);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const current = evaluations.find((row) => row.scope === evaluationKey(period, filters, getActiveAccount()));

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

  if (hasAiKey === null && !error) return null;

  if (!hasAiKey) {
    return (
      <div className={`ai ai-${variant} ai-off`}>
        <Badge />
        <p className="muted">Ocena okresu wymaga klucza OpenAI.</p>
        {onSetup ? (
          <button type="button" className="ghost sm ai-ask" onClick={onSetup}>
            <Icon name="settings" size={14} />
            Ustaw klucz AI
          </button>
        ) : null}
        {error ? <p className="banner error">{error}</p> : null}
      </div>
    );
  }

  const canAsk = !busy && !disabled && Boolean(period.from && period.to);

  return (
    <div className={`ai ai-${variant}`}>
      <div className="ai-head">
        <Badge />
        {current?.createdAt && !busy ? <span className="ai-date">{stamp(current.createdAt)}</span> : null}
      </div>
      {busy ? (
        <p className="muted ai-busy">Analizuję wydatki z tego okresu…</p>
      ) : current ? (
        <>
          <p className="ai-preview">{current.text}</p>
          <div className="ai-actions">
            <button type="button" className="link-btn" onClick={() => dialogRef.current?.showModal()}>
              Czytaj całość
            </button>
            <button type="button" className="link-btn quiet" disabled={!canAsk} onClick={() => void generate()}>
              Oceń ponownie
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="ghost sm ai-ask" disabled={!canAsk} onClick={() => void generate()}>
          Oceń ten okres
        </button>
      )}
      {error ? <p className="banner error">{error}</p> : null}
      {current ? (
        <dialog
          ref={dialogRef}
          className="ai-dialog"
          aria-label={`Ocena AI: ${current.label}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
        >
          <div className="ai-dialog-body">
            <header>
              <div>
                <Badge />
                <h2>{current.label}</h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Zamknij"
                onClick={() => dialogRef.current?.close()}
              >
                <Icon name="close" />
              </button>
            </header>
            <p className="ai-text">{current.text}</p>
            <footer>
              <span className="muted">{current.createdAt ? stamp(current.createdAt) : ""}</span>
              <button
                type="button"
                className="ghost sm"
                disabled={!canAsk}
                onClick={() => {
                  dialogRef.current?.close();
                  void generate();
                }}
              >
                Oceń ponownie
              </button>
            </footer>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
