import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  onSubmit,
}: {
  open: boolean;
  title: string;
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>(".modal-content :is(input, select, textarea)")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <form
          className="modal-body"
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          <header>
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2>{title}</h2>
            </div>
            <button type="button" className="icon-btn" aria-label="Zamknij" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          <div className="modal-content">{children}</div>
          {footer ? <footer>{footer}</footer> : null}
        </form>
      ) : null}
    </dialog>
  );
}
