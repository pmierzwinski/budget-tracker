import { useRef, useState } from "react";
import { parseEvaluationText } from "../../../shared/ai";
import { evaluationKey } from "../../../shared/domain";
import { getContext } from "../../app/AppContext";
import { errorMessage } from "../../lib/format";
import type { Period } from "../period";
import { Icon } from "../../ui/Icon";
import { evaluatePeriod } from "./ai";

function EvaluationBody({ text, compact }: { text: string; compact?: boolean }) {
  const sections = parseEvaluationText(text);
  if (sections.length === 1 && !sections[0].title) {
    return <p className={compact ? "ai-preview" : "ai-text"}>{text}</p>;
  }
  return (
    <div className={compact ? "ai-sections compact" : "ai-sections"}>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

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
  const { database, env, account, meta } = getContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { hasAiKey } = meta;
  const scope = evaluationKey({ ...period, ...filters, account });
  const current = database.data.evaluations.find((row) => row.scope === scope);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      await evaluatePeriod(database, env, { from: period.from, to: period.to, ...filters }, account);
    } catch (err) {
      setError(errorMessage(err, "Ocena AI nie powiodła się"));
    } finally {
      setBusy(false);
    }
  }

  if (!hasAiKey) {
    return (
      <div className={`ai ai-${variant} ai-off`}>
        <Badge />
        <p className="muted">Ocena okresu wymaga klucza AI.</p>
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
          {variant === "strip" ? (
            <p className="ai-preview">{parseEvaluationText(current.text)[0]?.body || current.text}</p>
          ) : (
            <EvaluationBody text={current.text} compact />
          )}
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
            <div className="ai-text">
              <EvaluationBody text={current.text} />
            </div>
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
