import { useState } from "react";
import { getContext } from "../../app/AppContext";
import { DownloadButton, usePlatform } from "../../platform";
import { Icon } from "../../ui/Icon";
import { errorMessage } from "../../lib/format";
import { importDemo } from "../../modules/import";

/** Dashboard without any data: generate demo data or import a CSV. */
export function NoDataYet({ onError }: { onError: (message: string) => void }) {
  const { database, meta, navigate, reloadPage } = getContext();
  const { onDevice, trial, showcase } = usePlatform();
  const { downloadUrl } = meta.app;
  const [generating, setGenerating] = useState(false);

  async function generateDemo() {
    setGenerating(true);
    try {
      await importDemo(database);
      reloadPage();
    } catch (err) {
      onError(errorMessage(err, "Nie udało się wygenerować danych"));
      setGenerating(false);
    }
  }

  return (
    <div className="empty-card">
      <h2>{trial ? "Wypróbuj aplikację" : "Brak zaimportowanych danych"}</h2>
      <p>
        {onDevice
          ? "Wgraj CSV z bankowości albo wygeneruj konto testowe z 6 miesiącami przykładowych płatności. Dane zostają na tym urządzeniu i nigdzie nie są wysyłane."
          : "Wgraj CSV z bankowości — wykresy pojawią się od razu. Możesz też najpierw obejrzeć przykładowe dane."}
      </p>
      <div className="row">
        <button type="button" className="primary" disabled={generating} onClick={() => void generateDemo()}>
          <Icon name="file" size={16} />
          {generating ? "Generuję…" : "Wygeneruj dane testowe"}
        </button>
        <button type="button" className="ghost" onClick={() => navigate("import")}>
          Importuj historię
        </button>
        {showcase && downloadUrl ? <DownloadButton url={downloadUrl} quiet /> : null}
      </div>
    </div>
  );
}
