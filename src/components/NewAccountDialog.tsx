import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../app/AppContext";
import { errorMessage } from "../format";
import type { Account } from "../types";
import { Modal } from "./Modal";

/** "Nowe konto" dialog; `withIban` adds the optional account number field. */
export function NewAccountDialog({
  open,
  eyebrow,
  defaultBank = "pko",
  withIban,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  eyebrow: string;
  defaultBank?: string;
  withIban?: boolean;
  onClose: () => void;
  onCreated: (account: Account) => void;
  onError: (message: string) => void;
}) {
  const { meta } = useApp();
  const [name, setName] = useState("");
  const [bank, setBank] = useState(defaultBank);
  const [iban, setIban] = useState("");

  useEffect(() => {
    if (open) setBank(defaultBank);
  }, [open, defaultBank]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const result = await api.createAccount({ name: trimmed, bank, iban: iban.trim() || undefined });
      setName("");
      setIban("");
      onCreated(result.account);
    } catch (err) {
      onError(errorMessage(err, "Nie dodano konta"));
    }
  }

  return (
    <Modal
      open={open}
      title="Nowe konto"
      eyebrow={eyebrow}
      onClose={onClose}
      onSubmit={() => void create()}
      footer={
        <>
          <button type="button" className="ghost" onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            Dodaj konto
          </button>
        </>
      }
    >
      <label className="field">
        Nazwa
        <input
          autoFocus
          maxLength={60}
          value={name}
          placeholder="np. mBank wspólne, ING oszczędności"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Bank
        <BankSelect value={bank} onChange={setBank} banks={meta.banks} />
      </label>
      {withIban ? (
        <>
          <label className="field">
            Numer rachunku <span className="muted">(opcjonalnie)</span>
            <input value={iban} placeholder="PL00 0000 …" onChange={(e) => setIban(e.target.value)} />
          </label>
          <p className="field-hint">Z numerem rachunku import z opcją „Wykryj automatycznie” sam trafi na to konto.</p>
        </>
      ) : null}
    </Modal>
  );
}

export function BankSelect({
  value,
  onChange,
  banks,
  detectOption,
}: {
  value: string;
  onChange: (bank: string) => void;
  banks: { id: string; name: string }[];
  detectOption?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {detectOption ? <option value="">{detectOption}</option> : null}
      {banks.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
