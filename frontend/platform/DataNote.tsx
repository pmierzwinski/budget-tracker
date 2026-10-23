import { usePlatform } from "./usePlatform";

/** Sidebar footnote: where the data stays on this platform. */
export function DataNote() {
  const { trial, phone } = usePlatform();
  if (trial)
    return (
      <p className="sidebar-note web-note">
        <strong>Wersja w przeglądarce</strong>
        Dane zapisują się tylko w tej przeglądarce i nigdzie nie są wysyłane. Wyczyszczenie danych przeglądarki je
        usuwa — żeby trzymać je w pliku na dysku, pobierz aplikację.
      </p>
    );
  if (phone) return <p className="sidebar-note">Dane zostają na tym telefonie i nigdzie nie są wysyłane.</p>;
  return (
    <p className="sidebar-note">Dane zostają na tym komputerze. Logowanie do banku odbywa się wyłącznie na stronie banku.</p>
  );
}
