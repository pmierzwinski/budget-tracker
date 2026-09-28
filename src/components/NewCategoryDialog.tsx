import { useEffect, useState } from "react";
import { categoryColor } from "../format";
import type { CategoryScope } from "./CategorySelect";
import { Modal } from "./Modal";

export function NewCategoryDialog({
  open,
  categories,
  who,
  onClose,
  onCreate,
}: {
  open: boolean;
  categories: string[];
  who?: string;
  onClose: () => void;
  onCreate: (name: string, scope: CategoryScope) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<CategoryScope>("one");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setScope("one");
    setError("");
    setBusy(false);
  }, [open]);

  const trimmed = name.trim();
  const duplicate = categories.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  const merchant = who?.trim();

  async function submit() {
    if (!trimmed || busy) return;
    if (duplicate) {
      setError(`Kategoria „${duplicate}” już istnieje — wybierz ją z listy.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate(trimmed, scope);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie dodano kategorii");
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Nowa kategoria"
      eyebrow={merchant ? `Płatność: ${merchant}` : "Kategorie"}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="primary" disabled={!trimmed || busy || Boolean(duplicate)}>
            {busy ? "Zapisuję…" : merchant ? "Dodaj i przypisz" : "Dodaj kategorię"}
          </button>
        </>
      }
    >
      <label className="field">
        Nazwa
        <span className="name-preview">
          <span className="swatch lg" style={{ background: categoryColor(trimmed || "Nowa") }} />
          <input
            autoFocus
            maxLength={40}
            value={name}
            placeholder="np. Pociągi, Prezenty, Remont"
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
        </span>
      </label>
      {duplicate && !error ? <p className="field-hint warn">Taka kategoria już jest: {duplicate}</p> : null}
      {merchant ? (
        <div className="scope-choice" role="radiogroup" aria-label="Zakres zmiany">
          <label className={scope === "one" ? "scope-option active" : "scope-option"}>
            <input type="radio" name="scope" checked={scope === "one"} onChange={() => setScope("one")} />
            <span>
              Tylko ta płatność
              <small>pozostałe od tego odbiorcy zostają bez zmian</small>
            </span>
          </label>
          <label className={scope === "merchant" ? "scope-option active" : "scope-option"}>
            <input type="radio" name="scope" checked={scope === "merchant"} onChange={() => setScope("merchant")} />
            <span>
              Wszystkie od „{merchant}”
              <small>zmienia wszystkie dotychczasowe i przyszłe płatności od tego odbiorcy (tworzy regułę)</small>
            </span>
          </label>
        </div>
      ) : null}
      {error ? <p className="banner error">{error}</p> : null}
    </Modal>
  );
}
