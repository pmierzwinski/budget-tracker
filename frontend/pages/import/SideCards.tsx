import type { Bank } from "../../../shared/types";
import { bankLabel } from "../../lib/format";
import { Icon } from "../../ui/Icon";

const HOW_TO: Record<string, string[]> = {
  pko: ["Zaloguj się do iPKO.", "Konto → Historia operacji.", "Ustaw zakres dat → Pobierz → CSV."],
  mbank: ["Zaloguj się do mBanku.", "Historia → ustaw zakres dat.", "Pobierz → CSV."],
  ing: ["Zaloguj się do Moje ING.", "Historia → ustaw zakres dat.", "Pobierz → CSV."],
  santander: ["Zaloguj się do Santander internet.", "Konto → Historia.", "Eksportuj → CSV."],
  pekao: ["Zaloguj się do Pekao24.", "Historia rachunku → zakres dat.", "Eksport → CSV."],
  millennium: ["Zaloguj się do Millenetu.", "Historia transakcji → zakres dat.", "Eksportuj → CSV."],
  alior: ["Zaloguj się do Alior Online.", "Historia → zakres dat.", "Pobierz → CSV."],
  revolut: ["W aplikacji Revolut: Konto → Wyciągi.", "Wybierz Excel/CSV i zakres dat.", "Prześlij plik na komputer."],
  credit_agricole: ["Zaloguj się do CA24.", "Historia operacji → zakres dat.", "Eksport → CSV."],
};

/** "Skąd wziąć plik" for the chosen bank. */
export function HowToCard({ bank, banks }: { bank: string; banks: Bank[] }) {
  const steps = HOW_TO[bank] || ["Zaloguj się do bankowości.", "Otwórz historię rachunku.", "Wyeksportuj ją do CSV."];
  return (
    <article className="card">
      <h2>Skąd wziąć plik · {bankLabel(banks, bank)}</h2>
      <ol className="steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
        <li>Upuść plik w polu obok.</li>
      </ol>
      <p className="card-foot">Nazwy przycisków różnią się między wersjami bankowości — szukaj eksportu historii do CSV.</p>
    </article>
  );
}

export function DemoCard({ busy, onDemo }: { busy: boolean; onDemo: (uncategorized: boolean) => void }) {
  return (
    <article className="card">
      <h2>Chcesz tylko popatrzeć?</h2>
      <p className="muted">
        Osobne „Konto testowe” z 6 miesiącami przykładowych płatności: zakupy, paliwo, czynsz, subskrypcje, wynagrodzenie.
        Twoje dane zostają bez zmian.
      </p>
      <div className="row">
        <button className="ghost" type="button" disabled={busy} onClick={() => onDemo(false)}>
          <Icon name="file" size={16} />
          Dodaj konto testowe
        </button>
        <button
          className="ghost"
          type="button"
          disabled={busy}
          title="Wszystkie płatności w „Inne” — do przetestowania kategoryzacji, reguł i AI"
          onClick={() => onDemo(true)}
        >
          Dodaj bez kategorii
        </button>
      </div>
    </article>
  );
}

export function ClearCard({ busy, onClear }: { busy: boolean; onClear: (all: boolean) => void }) {
  return (
    <article className="card danger-zone">
      <h2>Czyszczenie bazy</h2>
      <p className="muted">Nie da się tego cofnąć.</p>
      <div className="row">
        <button className="ghost danger" type="button" disabled={busy} onClick={() => onClear(false)}>
          Wyczyść transakcje
        </button>
        <button className="ghost danger" type="button" disabled={busy} onClick={() => onClear(true)}>
          Wyczyść wszystko
        </button>
      </div>
    </article>
  );
}
