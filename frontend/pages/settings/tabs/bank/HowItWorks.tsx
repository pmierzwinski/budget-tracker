import { useState } from "react";
import { Icon } from "../../../../ui/Icon";
import type { Provider } from "./bank";

/** Setup steps for the chosen provider; Enable Banking shows the Redirect URL to register. */
export function HowItWorks({ provider, redirectUrl, onError }: { provider: Provider; redirectUrl?: string; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);

  async function copyRedirect() {
    if (!redirectUrl) return;
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      onError("Nie udało się skopiować — zaznacz adres ręcznie.");
    }
  }

  return (
    <article className="card">
      <h2>Jak to działa</h2>
      <p className="muted">
        Banki udostępniają historię tylko licencjonowanym pośrednikom (PSD2). Nie potrzebujesz klucza od banku — logujesz się
        na stronie swojego banku, a tu trafia wyłącznie historia transakcji. Zgoda działa do 90–180 dni, potem wystarczy ją
        odnowić.
      </p>
      {provider === "enablebanking" ? (
        <ol className="steps">
          <li>
            Załóż darmowe konto na{" "}
            <a href="https://enablebanking.com/sign-in/" target="_blank" rel="noreferrer">
              enablebanking.com
            </a>
            .
          </li>
          <li>
            W Control Panel → <strong>API applications</strong> dodaj aplikację (środowisko Production), wygeneruj klucz w
            przeglądarce i zapisz plik <strong>.pem</strong>.
          </li>
          <li>
            Jako <strong>Redirect URL</strong> podaj:
            {redirectUrl ? (
              <span className="copy-field">
                <code title={redirectUrl}>{redirectUrl}</code>
                <button type="button" className="icon-btn" aria-label="Kopiuj adres" onClick={() => void copyRedirect()}>
                  <Icon name={copied ? "check" : "copy"} size={15} />
                </button>
              </span>
            ) : null}
          </li>
          <li>
            Aktywuj aplikację przez <strong>Link accounts</strong> — połącz własne konta (tryb prywatny jest bezpłatny).
          </li>
          <li>Wklej Application ID i klucz obok, wybierz bank i kliknij „Połącz z bankiem”.</li>
        </ol>
      ) : (
        <ol className="steps">
          <li>
            Zaloguj się na{" "}
            <a href="https://bankaccountdata.gocardless.com/" target="_blank" rel="noreferrer">
              bankaccountdata.gocardless.com
            </a>
            .
          </li>
          <li>
            Wygeneruj <strong>Secret ID</strong> i <strong>Secret Key</strong>.
          </li>
          <li>Wklej je obok, wybierz bank i kliknij „Połącz z bankiem”.</li>
          <li>Zatwierdź zgodę w bankowości. Zgoda działa do 90 dni.</li>
        </ol>
      )}
    </article>
  );
}
