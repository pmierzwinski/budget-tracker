import { useState } from "react";
import { DEFAULT_CATEGORY, limitStatus } from "../../../shared/domain";
import { Swatch } from "../../modules/categories";
import { money, percent } from "../../lib/format";

/** One category: spend in the period, monthly limit (saved on Enter / blur), usage, rename and delete. */
export function CategoryRow({
  name,
  spent,
  limit,
  factor,
  draft,
  busy,
  onDraft,
  onSaveLimit,
  onRename,
  onRemove,
}: {
  name: string;
  spent: number;
  limit: number | undefined;
  /** How many months the period covers (limits are monthly). */
  factor: number;
  draft: string;
  busy: boolean;
  onDraft: (value: string) => void;
  onSaveLimit: () => void;
  onRename: (next: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const allowed = limit ? limit * factor : 0;
  const ratio = allowed ? spent / allowed : 0;
  const status = limitStatus(ratio);

  function finishRename() {
    if (editing == null) return;
    const next = editing.trim();
    setEditing(null);
    if (next && next !== name) onRename(next);
  }

  return (
    <div className={limit ? "limit-line has-limit" : "limit-line"}>
      <span className="cat-line-name">
        <Swatch category={name} />
        {editing != null ? (
          <input
            aria-label={`Nowa nazwa dla ${name}`}
            value={editing}
            autoFocus
            disabled={busy}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(null);
            }}
            onBlur={finishRename}
          />
        ) : (
          <span>{name}</span>
        )}
      </span>
      <span className="num">{spent ? money(spent) : "—"}</span>
      <div className="money-input">
        <input
          inputMode="decimal"
          aria-label={`Limit miesięczny dla ${name}`}
          placeholder="—"
          disabled={busy}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={onSaveLimit}
        />
        <span>zł</span>
      </div>
      {limit ? (
        <span className="limit-usage">
          <span className="limit-track" aria-hidden>
            <span className={`limit-fill ${status}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </span>
          <span className={`limit-pct ${status}`}>{percent(spent, allowed)}</span>
        </span>
      ) : (
        <span className="muted limit-none">bez limitu</span>
      )}
      {name === DEFAULT_CATEGORY ? (
        <em className="cat-default">domyślna</em>
      ) : (
        <div className="cat-actions">
          <button className="ghost sm" type="button" disabled={busy} onClick={() => setEditing(name)}>
            Zmień nazwę
          </button>
          <button className="ghost sm danger" type="button" disabled={busy} onClick={onRemove}>
            Usuń
          </button>
        </div>
      )}
    </div>
  );
}
