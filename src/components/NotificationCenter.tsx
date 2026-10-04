import { useEffect, useRef, useState } from "react";
import { useApp } from "../app/AppContext";
import type { AppNotification } from "../app/notifications";
import { Icon } from "./Icon";

const TOAST_MS = 6000;

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function NotificationCenter() {
  const { notifications, clearNotifications, openNotification } = useApp();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const seen = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item) => !item.read).length;
  const latest = notifications[0];

  useEffect(() => {
    if (!latest || latest.read || latest.id === seen.current) return;
    seen.current = latest.id;
    setToast(latest);
    const timer = window.setTimeout(() => setToast((current) => (current?.id === latest.id ? null : current)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [latest]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function openItem(item: AppNotification) {
    openNotification(item);
    setOpen(false);
    setToast(null);
  }

  return (
    <div className="notify" ref={root}>
      <button
        type="button"
        className={open ? "icon-btn notify-bell open" : "icon-btn notify-bell"}
        aria-label={unread ? `Powiadomienia, ${unread} nieprzeczytane` : "Powiadomienia"}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setToast(null);
        }}
      >
        <Icon name="bell" />
        {unread ? <span className="notify-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {toast && !open ? (
        <button type="button" className="notify-toast" onClick={() => openItem(toast)}>
          <strong>{toast.title}</strong>
          <span>{toast.body}</span>
        </button>
      ) : null}

      {open ? (
        <div className="notify-panel" role="dialog" aria-label="Powiadomienia">
          <div className="notify-head">
            <strong>Powiadomienia</strong>
            {notifications.length ? (
              <button type="button" className="link-btn quiet" onClick={clearNotifications}>
                Wyczyść
              </button>
            ) : null}
          </div>
          {notifications.length ? (
            <ul className="notify-list">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button type="button" className={item.read ? "notify-item read" : "notify-item"} onClick={() => openItem(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <em>{timeLabel(item.createdAt)}</em>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted notify-empty">Brak powiadomień</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
