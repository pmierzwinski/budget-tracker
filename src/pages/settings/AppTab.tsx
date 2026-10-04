import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Notices } from "../../components/ui/Notices";
import { useAction } from "../../hooks/useAction";

export function AppTab() {
  const { chooseAccount, reloadPage } = useApp();
  const { busy, message, error, setMessage, run } = useAction();
  const [asking, setAsking] = useState(false);

  function reset() {
    return run(async () => {
      await api.clear(true);
      chooseAccount("");
      await reloadPage();
      setAsking(false);
      setMessage("Aplikacja jest pusta. Zostały tylko wbudowane kategorie.");
    }, "Nie udało się zresetować aplikacji");
  }

  return (
    <article className="card danger-zone">
      <div className="card-head">
        <div>
          <h2>Reset aplikacji</h2>
          <p className="card-sub">Punkt startowy jak przy pierwszym uruchomieniu</p>
        </div>
      </div>
      <p>
        Usuwa płatności, konta, własne kategorie, reguły, limity, sesje banku i przedziały wykresów. Wracają wbudowane
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
  );
}
