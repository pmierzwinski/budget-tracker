import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { DownloadButton } from "../../components/DownloadButton";
import { Icon } from "../../components/Icon";
import { errorMessage } from "../../format";

/** Dashboard without any data: generate demo data, import or connect a bank. */
export function NoDataYet({ onError }: { onError: (message: string) => void }) {
  const { meta, navigate, reloadPage } = useApp();
  const { app } = meta;
  const [generating, setGenerating] = useState(false);

  async function generateDemo() {
    setGenerating(true);
    try {
      await api.importDemo();
      await reloadPage();
    } catch (err) {
      onError(errorMessage(err, "Nie udało się wygenerować danych"));
      setGenerating(false);
    }
  }

  return (
    <div className="empty-card">
      <h2>{app.hosted ? "Wypróbuj aplikację" : "Brak zaimportowanych danych"}</h2>
      <p>
        {app.hosted
          ? "Wygeneruj konto testowe z 6 miesiącami przykładowych płatności albo wgraj własny CSV z banku. Dane są tymczasowe i widzisz je tylko Ty."
          : "Wgraj CSV z bankowości albo połącz konto przez Open Banking — wykresy pojawią się od razu. Możesz też najpierw obejrzeć przykładowe dane."}
      </p>
      <div className="row">
        <button type="button" className="primary" disabled={generating} onClick={() => void generateDemo()}>
          <Icon name="file" size={16} />
          {generating ? "Generuję…" : "Wygeneruj dane testowe"}
        </button>
        <button type="button" className="ghost" onClick={() => navigate("import")}>
          Importuj historię
        </button>
        {app.hosted ? (
          app.downloadUrl ? <DownloadButton url={app.downloadUrl} quiet /> : null
        ) : (
          <button type="button" className="ghost" onClick={() => navigate("settings", "bank")}>
            Połącz z bankiem
          </button>
        )}
      </div>
    </div>
  );
}
