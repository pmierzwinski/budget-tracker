import { useState } from "react";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { NewAccountDialog } from "../../components/NewAccountDialog";
import { Notices } from "../../components/ui/Notices";
import { bankLabel, formatDay, plural } from "../../format";
import { useAction } from "../../hooks/useAction";
import { demoAddedMessage } from "../../messages";
import type { Account } from "../../types";

const PROVIDER_LABEL: Record<string, string> = {
  gocardless: "GoCardless",
  enablebanking: "Enable Banking",
};

type Draft = { id: string; name: string; iban: string } | null;

const DEMO_ACCOUNT = "Konto testowe";
const DEMO_RAW_ACCOUNT = "Konto testowe bez kategorii";
const DEMO_NAMES = [DEMO_ACCOUNT, DEMO_RAW_ACCOUNT];

export function AccountsTab() {
  const { meta, refreshMeta, navigate } = useApp();
  const { accounts, banks } = meta;
  const [draft, setDraft] = useState<Draft>(null);
  const [creating, setCreating] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoRaw, setDemoRaw] = useState(false);
  const { busy, message, error, setMessage, setError, run } = useAction();
  const demoName = demoRaw ? DEMO_RAW_ACCOUNT : DEMO_ACCOUNT;
  const demoExists = accounts.some((account) => account.name === demoName);

  async function applied(text: string) {
    setError("");
    setMessage(text);
    await refreshMeta();
  }

  function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    return run(async () => {
      const result = await api.updateAccount(draft.id, { name, iban: draft.iban.trim() });
      setDraft(null);
      await applied(`Zapisano konto „${result.account.name}”.`);
    }, "Nie zapisano konta");
  }

  function addDemo() {
    return run(async () => {
      const result = await api.importDemo({ uncategorized: demoRaw });
      setDemoOpen(false);
      await applied(`${demoAddedMessage(result, demoRaw)} Wybierz je w przełączniku konta w menu bocznym.`);
    }, "Nie dodano konta testowego");
  }

  function remove(account: Account) {
    const question = account.count
      ? `Usunąć konto „${account.name}” razem z ${account.count} płatnościami? Tego nie da się cofnąć.`
      : `Usunąć konto „${account.name}”?`;
    if (!window.confirm(question)) return;
    return run(async () => {
      const result = await api.deleteAccount(account.id);
      await applied(`Usunięto konto „${account.name}” (${result.removed} płatności).`);
    }, "Nie usunięto konta");
  }

  return (
    <>
      <Notices message={message} error={error} />

      <article className="card">
        <div className="card-head">
          <div>
            <h2>
              Konta <span className="count">{accounts.length}</span>
            </h2>
            <p className="card-sub">
              Przy więcej niż jednym koncie w menu bocznym pojawia się przełącznik — filtruje wszystkie widoki.
            </p>
          </div>
          <div className="row">
            <button
              className="ghost"
              type="button"
              title="Osobne konto z 6 miesiącami przykładowych płatności — żeby zobaczyć, jak wyglądają wykresy i statystyki"
              onClick={() => setDemoOpen(true)}
            >
              <Icon name="file" size={16} />
              Dodaj konto testowe
            </button>
            <button className="primary" type="button" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} />
              Nowe konto
            </button>
          </div>
        </div>

        {accounts.length ? (
          <ul className="account-list">
            {accounts.map((account) => {
              const editing = draft?.id === account.id;
              return (
                <li key={account.id} className={editing ? "editing" : undefined}>
                  <span className="account-avatar lg" aria-hidden>
                    <Icon name={account.provider ? "bank" : "wallet"} size={18} />
                  </span>
                  {editing && draft ? (
                    <form
                      className="account-edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveDraft();
                      }}
                    >
                      <input
                        autoFocus
                        aria-label="Nazwa konta"
                        maxLength={60}
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                      <input
                        aria-label="Numer rachunku"
                        placeholder="IBAN (opcjonalnie)"
                        value={draft.iban}
                        onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
                      />
                      <button className="primary sm" type="submit" disabled={!draft.name.trim()}>
                        Zapisz
                      </button>
                      <button className="ghost sm" type="button" onClick={() => setDraft(null)}>
                        Anuluj
                      </button>
                    </form>
                  ) : (
                    <div className="account-info">
                      <strong>
                        {account.name}
                        {DEMO_NAMES.includes(account.name) ? <span className="pill">przykładowe dane</span> : null}
                      </strong>
                      <span className="muted">
                        {bankLabel(banks, account.bank)}
                        {account.provider ? ` · ${PROVIDER_LABEL[account.provider] || account.provider}` : " · CSV"}
                        {account.iban ? <span className="iban"> · {account.iban}</span> : null}
                      </span>
                    </div>
                  )}
                  {!editing ? (
                    <>
                      <span className="account-range">
                        <strong className="num">
                          {account.count} {plural(account.count, "płatność", "płatności", "płatności")}
                        </strong>
                        <span className="muted">
                          {account.minDate ? `${formatDay(account.minDate)} – ${formatDay(account.maxDate)}` : "brak danych"}
                        </span>
                      </span>
                      <div className="cat-actions">
                        <button
                          className="ghost sm"
                          type="button"
                          onClick={() => setDraft({ id: account.id, name: account.name, iban: account.iban })}
                        >
                          Edytuj
                        </button>
                        <button className="ghost sm danger" type="button" onClick={() => void remove(account)}>
                          Usuń
                        </button>
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-card inline">
            <p className="muted">Konta tworzą się same przy imporcie albo połączeniu z bankiem.</p>
            <button className="primary" type="button" onClick={() => navigate("import")}>
              Importuj historię
            </button>
          </div>
        )}
        <p className="card-foot">
          Usunięcie konta kasuje jego płatności. Kategorie, reguły i limity są wspólne dla wszystkich kont.
        </p>
      </article>

      <NewAccountDialog
        open={creating}
        eyebrow="Konta"
        withIban
        onClose={() => setCreating(false)}
        onError={setError}
        onCreated={(account) => {
          setCreating(false);
          void applied(`Dodano konto „${account.name}”. Wybierz je przy imporcie.`);
        }}
      />

      <Modal
        open={demoOpen}
        title="Konto testowe"
        eyebrow="Konta"
        onClose={() => setDemoOpen(false)}
        onSubmit={() => void addDemo()}
        footer={
          <>
            <button type="button" className="ghost" onClick={() => setDemoOpen(false)}>
              Anuluj
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Dodaję…" : demoExists ? "Wygeneruj od nowa" : "Dodaj konto"}
            </button>
          </>
        }
      >
        <p className="muted">
          Osobne konto z 6 miesiącami przykładowych płatności (zakupy, paliwo, czynsz, subskrypcje, wynagrodzenie). Twoje
          dane zostają bez zmian.
        </p>
        <div className="scope-choice" role="radiogroup" aria-label="Rodzaj konta testowego">
          <label className={!demoRaw ? "scope-option active" : "scope-option"}>
            <input type="radio" name="demo" checked={!demoRaw} onChange={() => setDemoRaw(false)} />
            <span>
              Z kategoriami
              <small>płatności skategoryzowane Twoimi regułami — od razu widać wykresy i statystyki</small>
            </span>
          </label>
          <label className={demoRaw ? "scope-option active" : "scope-option"}>
            <input type="radio" name="demo" checked={demoRaw} onChange={() => setDemoRaw(true)} />
            <span>
              Bez kategorii
              <small>wszystko w „Inne” — do przetestowania ręcznej kategoryzacji, reguł i AI</small>
            </span>
          </label>
        </div>
        {demoExists ? (
          <p className="field-hint warn">„{demoName}” już jest — jego płatności zostaną wygenerowane od nowa.</p>
        ) : null}
        <p className="field-hint">
          Kategorie i reguły są wspólne dla wszystkich kont — reguła utworzona na koncie testowym zadziała też na Twoich
          danych.
        </p>
      </Modal>
    </>
  );
}
