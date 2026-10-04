import type { ReactNode } from "react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  eyebrow,
  children,
  confirmLabel,
  cancelLabel = "Anuluj",
  busy,
  danger,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  eyebrow?: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      eyebrow={eyebrow}
      onClose={busy ? () => undefined : onClose}
      onSubmit={onConfirm}
      footer={
        <>
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="submit" className={danger ? "ghost danger" : "primary"} disabled={busy}>
            {busy ? "Czekaj…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
