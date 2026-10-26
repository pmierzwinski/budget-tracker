import { useState } from "react";
import { BUILTIN_CATEGORIES, DEFAULT_CATEGORY } from "../../shared/domain";
import { getContext } from "../app/AppContext";
import { errorMessage } from "../lib/format";
import { replaceWithOwnCategories } from "../modules/categories/categories";
import { categoryColor } from "../modules/categories/colors";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

const STARTERS = BUILTIN_CATEGORIES.filter((name) => name !== DEFAULT_CATEGORY)
  .slice()
  .sort((a, b) => a.localeCompare(b, "pl"));

/** After the welcome dialog: keep the built-in categories, or replace them with your own. "Inne" stays. */
export function CategorySetupDialog({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { database } = getContext();
  const [custom, setCustom] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasPayments = database.data.transactions.length > 0;

  function close() {
    if (custom) {
      setCustom(false);
      setError("");
      return;
    }
    onDone();
  }

  function addName() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    if (trimmed.length > 40) {
      setError("Nazwa może mieć najwyżej 40 znaków.");
      return;
    }
    const taken =
      trimmed.toLowerCase() === DEFAULT_CATEGORY.toLowerCase() ||
      names.some((item) => item.toLowerCase() === trimmed.toLowerCase());
    if (taken) {
      setError(`Kategoria „${trimmed}” już jest na liście.`);
      return;
    }
    setNames((current) => [...current, trimmed]);
    setDraft("");
    setError("");
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await database.update((store) => replaceWithOwnCategories(store, names));
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Nie zapisano kategorii"));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={custom ? "Własne kategorie" : "Kategorie startowe"}
      eyebrow="Wydatki"
      onClose={close}
      onSubmit={custom ? () => void save() : undefined}
      footer={
        custom ? (
          <>
            <button type="button" className="ghost" onClick={close} disabled={busy}>
              Wróć
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Zapisuję…" : "Zapisz"}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ghost danger" onClick={() => setCustom(true)}>
              Usuń wszystkie
            </button>
            <button type="button" className="primary" onClick={onDone}>
              Zostaw startowe
            </button>
          </>
        )
      }
    >
      <p className="setup-note">
        {custom
          ? "Wpisz własne nazwy. „Inne” zostaje — tam trafiają płatności bez kategorii."
          : "Możesz zostać przy gotowych kategoriach albo usunąć je wszystkie i wpisać własne. „Inne” zostaje."}
      </p>
      {custom ? (
        <div className="inline-form">
          <input
            autoFocus
            maxLength={40}
            value={draft}
            placeholder="np. Pociągi, Prezenty, Remont"
            aria-label="Nazwa kategorii"
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addName();
            }}
          />
          <button type="button" className="ghost" onClick={addName} disabled={!draft.trim() || busy}>
            Dodaj
          </button>
        </div>
      ) : null}
      <ul className="setup-categories">
        {(custom ? names : STARTERS).map((name) => (
          <li key={name}>
            <span className="swatch" style={{ background: categoryColor(name) }} />
            {name}
            {custom ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Usuń ${name}`}
                disabled={busy}
                onClick={() => setNames((current) => current.filter((item) => item !== name))}
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </li>
        ))}
        <li className="locked">
          <span className="swatch" style={{ background: categoryColor(DEFAULT_CATEGORY) }} />
          Inne
          <small>zostaje</small>
        </li>
      </ul>
      {custom && hasPayments ? (
        <p className="setup-note">Płatności z usuniętych kategorii trafią do „Inne”.</p>
      ) : null}
      {error ? <p className="banner error">{error}</p> : null}
    </Modal>
  );
}
