import { useState } from "react";
import { getContext } from "../../app/AppContext";
import { errorMessage } from "../../lib/format";
import { NOTE_MAX, addPeriodNote, deletePeriodNote, noteRangeLabel, notesInPeriod, updatePeriodNote } from "./notes";
import type { Period } from "./period";

/** Descriptions saved for date ranges that overlap the period open on the page. */
export function PeriodNotes({ period }: { period: Period }) {
  const { database } = getContext();
  const notes = notesInPeriod(database.data.notes ?? [], period);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const range = noteRangeLabel(period);

  async function add() {
    try {
      await database.update((draft) => addPeriodNote(draft, period, text));
      setText("");
      setComposing(false);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Nie zapisano opisu"));
    }
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      await database.update((draft) => updatePeriodNote(draft, editing.id, editing.text));
      setEditing(null);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Nie zapisano opisu"));
    }
  }

  async function remove(id: string) {
    try {
      await database.update((draft) => deletePeriodNote(draft, id));
      if (editing?.id === id) setEditing(null);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Nie usunięto opisu"));
    }
  }

  return (
    <article className="card period-notes">
      <div className="card-head">
        <div>
          <h2>Opis okresu</h2>
          <p className="card-sub">Opisy zapisane dla dat z tego zakresu.</p>
        </div>
        {composing ? null : (
          <button type="button" className="ghost sm" onClick={() => setComposing(true)}>
            Dodaj opis
          </button>
        )}
      </div>
      {error ? <p className="banner error">{error}</p> : null}
      {composing ? (
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <label className="field">
            <span>Nowy opis dla: {range}</span>
            <textarea
              value={text}
              maxLength={NOTE_MAX}
              rows={4}
              placeholder="Np. kupiłem opony i naprawiłem rower."
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="row">
            <button type="submit" className="primary sm">
              Zapisz
            </button>
            <button
              type="button"
              className="ghost sm"
              onClick={() => {
                setComposing(false);
                setText("");
              }}
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 ? (
        composing ? null : <p className="muted">Brak opisów w tym zakresie.</p>
      ) : (
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id} className="period-note">
              {editing?.id === note.id ? (
                <form
                  className="note-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit();
                  }}
                >
                  <label className="field">
                    <span>{noteRangeLabel(note)}</span>
                    <textarea
                      value={editing.text}
                      maxLength={NOTE_MAX}
                      rows={4}
                      onChange={(event) => setEditing({ id: note.id, text: event.target.value })}
                    />
                  </label>
                  <div className="row">
                    <button type="submit" className="primary sm">
                      Zapisz
                    </button>
                    <button type="button" className="ghost sm" onClick={() => setEditing(null)}>
                      Anuluj
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="note-top">
                    <span className="note-range">{noteRangeLabel(note)}</span>
                    <span className="row">
                      <button type="button" className="link-btn" onClick={() => setEditing({ id: note.id, text: note.text })}>
                        Edytuj
                      </button>
                      <button type="button" className="link-btn" onClick={() => void remove(note.id)}>
                        Usuń
                      </button>
                    </span>
                  </div>
                  <p className="note-text">{note.text}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
