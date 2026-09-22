import { useEffect, useState } from "react";

export function CommentNote({
  value,
  compact,
  onSave,
}: {
  value: string;
  compact?: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function finish(raw: string) {
    const next = raw.trim().slice(0, 80);
    setDraft(next);
    setEditing(false);
    if (next !== value) onSave(next);
  }

  if (editing) {
    return (
      <input
        className={compact ? "pay-note-input compact" : "pay-note-input"}
        value={draft}
        autoFocus
        maxLength={80}
        placeholder="np. zmywarka"
        aria-label="Komentarz do płatności"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(event.currentTarget.value);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={(event) => event.stopPropagation()}
      />
    );
  }

  if (value) {
    return (
      <button
        type="button"
        className={compact ? "pay-note compact" : "pay-note"}
        title="Zmień komentarz"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={compact ? "pay-note empty compact" : "pay-note empty"}
      title="Dodaj komentarz"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {compact ? "notatka" : "Dodaj komentarz"}
    </button>
  );
}
