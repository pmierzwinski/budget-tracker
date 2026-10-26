import { useState, type ReactNode } from "react";
import { getContext } from "../app/AppContext";
import { CategorySetupDialog } from "./CategorySetupDialog";
import { categoriesSetup, markCategoriesSetup, markWelcomeSeen, welcomeSeen } from "./showcase";
import type { AppMode } from "../../shared/types";
import { DownloadButton } from "./DownloadButton";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";

const STORED: Record<AppMode, ReactNode> = {
  local: (
    <>
      W pliku <code>data/wydatki.json</code> w folderze aplikacji. Kopia zapasowa = skopiuj folder „data”.
    </>
  ),
  desktop: (
    <>
      W pliku <code>wydatki.json</code> w folderze danych aplikacji. Kopia zapasowa = skopiuj ten folder.
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

const NOTHING_ELSE: Record<AppMode, string> = {
  local: "Nic więcej nie opuszcza komputera.",
  desktop: "Nic więcej nie opuszcza komputera.",
  web: "Nic więcej — ta strona nie ma serwera, który mógłby odebrać Twoje dane.",
  android: "Nic więcej nie opuszcza telefonu.",
};

/** Where the data is stored and which actions send anything out. Shown once everywhere, reopened from Settings. */
export function WelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { meta } = getContext();
  const { mode, downloadUrl, showDownload, dataDir } = meta.app;
  const download = showDownload && downloadUrl;
  const where = dataDir ? (
    <>
      W pliku <code>wydatki.json</code> w folderze <code>{dataDir}</code>. Kopia zapasowa = skopiuj ten folder.
    </>
  ) : (
    STORED[mode]
  );

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
            <strong>Zapisane:</strong> {where}
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
          <Icon name="check" size={18} />
          <p>{NOTHING_ELSE[mode]}</p>
        </li>
      </ul>
    </Modal>
  );
}

type FirstStep = "welcome" | "categories" | "done";

function firstStep(): FirstStep {
  if (!welcomeSeen()) return "welcome";
  if (!categoriesSetup()) return "categories";
  return "done";
}

/** Welcome dialog, then the starting-category choice. Each one shows once per browser. */
export function FirstVisitWelcome() {
  const [step, setStep] = useState(firstStep);

  if (step === "welcome") {
    return (
      <WelcomeDialog
        open
        onClose={() => {
          markWelcomeSeen();
          setStep(categoriesSetup() ? "done" : "categories");
        }}
      />
    );
  }

  if (step === "categories") {
    return (
      <CategorySetupDialog
        open
        onDone={() => {
          markCategoriesSetup();
          setStep("done");
        }}
      />
    );
  }

  return null;
}
