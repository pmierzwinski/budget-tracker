import { useState, type ReactNode } from "react";
import { getContext } from "../app/AppContext";
import { isShowcase, markWelcomeSeen, welcomeSeen } from "./showcase";
import type { AppMode } from "../../shared/types";
import { DownloadButton } from "./DownloadButton";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

const STORED: Record<AppMode, ReactNode> = {
  local: (
    <>
      W pliku <code>data/wydatki.db</code> w folderze aplikacji. Kopia zapasowa = skopiuj folder „data”.
    </>
  ),
  desktop: (
    <>
      W pliku <code>data/wydatki.db</code> w folderze obok programu. Kopia zapasowa = skopiuj folder „data”.
    </>
  ),
  web: (
    <>
      Tylko w tej przeglądarce, na tym komputerze. <strong>Wyczyszczenie danych przeglądarki albo tryb incognito
      usuwa je</strong> — żeby trzymać je w pliku na dysku, pobierz aplikację na Windows.
    </>
  ),
  android: (
    <>
      Tylko na tym telefonie, w pamięci aplikacji. <strong>Odinstalowanie aplikacji albo „Wyczyść dane” w
      ustawieniach Androida usuwa je.</strong>
    </>
  ),
};

const BANK: Record<AppMode, ReactNode> = {
  local: "Gdy połączysz konto: logujesz się na stronie banku, a historię pobiera Enable Banking albo GoCardless.",
  desktop: "Gdy połączysz konto: logujesz się na stronie banku, a historię pobiera Enable Banking albo GoCardless.",
  web: "W tej wersji połączenia z bankiem nie ma.",
  android: "W tej wersji połączenia z bankiem jeszcze nie ma.",
};

const NOTHING_ELSE: Record<AppMode, string> = {
  local: "Nic więcej nie opuszcza komputera.",
  desktop: "Nic więcej nie opuszcza komputera.",
  web: "Nic więcej — ta strona nie ma serwera, który mógłby odebrać Twoje dane.",
  android: "Nic więcej nie opuszcza telefonu.",
};

/** Where the data is stored and which actions send anything out. Shown once everywhere, reopened from Settings. */
export function WelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { meta } = getContext();
  const { mode, downloadUrl } = meta.app;
  const download = isShowcase(meta.app) && downloadUrl;

  return (
    <Modal
      open={open}
      title="Gdzie są Twoje dane"
      eyebrow="Wydatki"
      onClose={onClose}
      footer={
        download ? (
          <>
            <DownloadButton url={downloadUrl} quiet />
            <button type="button" className="primary" onClick={onClose}>
              Wypróbuj tutaj
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={onClose}>
            Rozumiem
          </button>
        )
      }
    >
      <ul className="welcome-list">
        <li>
          <Icon name="shield" size={18} />
          <p>
            <strong>Zapisane:</strong> {STORED[mode]}
          </p>
        </li>
        <li>
          <Icon name="sparkle" size={18} />
          <p>
            <strong>Wysyłane tylko przy AI:</strong> gdy wpiszesz własny klucz i użyjesz AI (kategoryzacja, ocena
            okresu), wybrane płatności — odbiorca, kwota, data — idą do wybranego dostawcy (OpenAI, Gemini, Claude), na
            Twoim koncie.
          </p>
        </li>
        <li>
          <Icon name="bank" size={18} />
          <p>
            <strong>Bank:</strong> {BANK[mode]}
          </p>
        </li>
        <li>
          <Icon name="check" size={18} />
          <p>{NOTHING_ELSE[mode]}</p>
        </li>
      </ul>
    </Modal>
  );
}

/** The welcome dialog on the first visit (per browser / device). */
export function FirstVisitWelcome() {
  const [open, setOpen] = useState(() => !welcomeSeen());
  return (
    <WelcomeDialog
      open={open}
      onClose={() => {
        markWelcomeSeen();
        setOpen(false);
      }}
    />
  );
}
