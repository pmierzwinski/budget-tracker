import { getContext } from "../app/AppContext";
import { DownloadButton } from "./DownloadButton";
import { usePlatform } from "./usePlatform";

/** Settings → bank on web and Android: no local server, so no bank connection — CSV import instead. */
export function BankUnavailable() {
  const { meta, navigate } = getContext();
  const { phone, trial } = usePlatform();
  return (
    <div className="empty-card">
      <h2>{phone ? "Połączenie z bankiem będzie w kolejnej wersji" : "Połączenie z bankiem działa tylko w aplikacji"}</h2>
      <p>
        {phone
          ? "Na razie wgraj plik CSV wyeksportowany z bankowości — instrukcja dla Twojego banku jest w zakładce Import."
          : "Wersja w przeglądarce nie ma serwera, a połączenie z bankiem go wymaga (klucze aplikacji, powrót ze strony banku). Pobierz aplikację, uruchom ją u siebie i połącz konto tutaj. Do tego czasu możesz wgrać plik CSV."}
      </p>
      <div className="row">
        {trial && meta.app.downloadUrl ? <DownloadButton url={meta.app.downloadUrl} /> : null}
        <button type="button" className="ghost" onClick={() => navigate("import")}>
          Importuj CSV
        </button>
      </div>
    </div>
  );
}
