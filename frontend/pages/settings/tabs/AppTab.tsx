import { useState } from "react";
import { getContext } from "../../../app/AppContext";
import { DownloadButton, ShutdownButton, usePlatform, WelcomeDialog } from "../../../platform";
import { ConfirmDialog } from "../../../ui/ConfirmDialog";
import { Notices } from "../../../ui/Notices";
import { useAction } from "../../../lib/useAction";
import { clearData } from "../../../modules/import";

export function AppTab() {
  const { database, meta, chooseAccount, reloadPage } = getContext();
  const { downloadUrl } = meta.app;
  const features = usePlatform();
  const [dataInfo, setDataInfo] = useState(false);
  const { busy, message, error, setMessage, run } = useAction();
  const [asking, setAsking] = useState(false);

  function reset() {
    return run(async () => {
      await database.update((draft) => clearData(draft, true));
      chooseAccount("");
      reloadPage();
      setAsking(false);
      setMessage("Aplikacja jest pusta. Zostały tylko wbudowane kategorie.");
    }, "Nie udało się zresetować aplikacji");
  }

  return (
    <div className="stack">
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Twoje dane</h2>
          <p className="card-sub">Gdzie są zapisane i co jest wysyłane</p>
        </div>
      </div>
      <div className="row">
        <button type="button" className="ghost" onClick={() => setDataInfo(true)}>
          Gdzie są moje dane
        </button>
      </div>
      <WelcomeDialog open={dataInfo} onClose={() => setDataInfo(false)} />
    </article>
    {features.shutdown ? (
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Zamknięcie aplikacji</h2>
            <p className="card-sub">{meta.app.packaged ? "Zamyka okno aplikacji" : "Wyłącza serwer w oknie konsoli"}</p>
          </div>
        </div>
        <p>
          {meta.app.packaged
            ? "Dane są zapisane na bieżąco. Zamknięcie okna też wyłącza aplikację."
            : "Zamknięcie karty przeglądarki nie wyłącza aplikacji. Dane są zapisane na bieżąco w folderze „data”."}
        </p>
        <div className="row">
          <ShutdownButton />
        </div>
      </article>
    ) : null}
    {features.showcase && downloadUrl ? (
      <article className="card">
        <div className="card-head">
          <div>
            <h2>Aplikacja na komputer</h2>
            <p className="card-sub">Windows, działa offline, dane zostają u Ciebie</p>
          </div>
        </div>
        <p>
          Zainstaluj <strong>Wydatki</strong> na Windows — własne okno, bez przeglądarki. Dane zostają na tym komputerze.
          Albo pobierz kod i kliknij <strong>Wydatki.cmd</strong> (potrzebny Node 22).
        </p>
        <DownloadButton url={downloadUrl} />
      </article>
    ) : null}
    <article className="card danger-zone">
      <div className="card-head">
        <div>
          <h2>Reset aplikacji</h2>
          <p className="card-sub">Punkt startowy jak przy pierwszym uruchomieniu</p>
        </div>
      </div>
      <p>
        Usuwa płatności, konta, własne kategorie, reguły, limity i przedziały wykresów. Wracają wbudowane
        kategorie (Spożywcze, Paliwo, Inne…), także te, które wcześniej usunąłeś. Klucz AI zostaje, jeśli go zapisałeś.
      </p>
      <Notices message={message} error={error} />
      <div className="row">
        <button type="button" className="ghost danger" disabled={busy} onClick={() => setAsking(true)}>
          Zresetuj aplikację
        </button>
      </div>
      <ConfirmDialog
        open={asking}
        title="Zresetować aplikację?"
        eyebrow="Tej operacji nie da się cofnąć"
        danger
        busy={busy}
        confirmLabel="Zresetuj aplikację"
        onClose={() => setAsking(false)}
        onConfirm={() => void reset()}
      >
        <p>
          To skasuje wszystkie płatności, konta, własne kategorie, reguły i limity. Wrócą tylko wbudowane kategorie
          (także te, które wcześniej usunąłeś).
        </p>
      </ConfirmDialog>
    </article>
    </div>
  );
}
