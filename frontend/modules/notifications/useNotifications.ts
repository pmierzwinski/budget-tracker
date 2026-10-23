import { useCallback, useState } from "react";
import { loadNotifications, makeNotification, saveNotifications, type NotificationDraft } from "./notifications";

/** The bell's list (last 20, kept in localStorage). */
export function useNotifications() {
  const [notifications, setNotifications] = useState(loadNotifications);

  const notify = useCallback((draft: NotificationDraft) => {
    setNotifications((current) => {
      const next = [makeNotification(draft), ...current].slice(0, 20);
      saveNotifications(next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, read: true } : item));
      saveNotifications(next);
      return next;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    saveNotifications([]);
  }, []);

  return { notifications, notify, markRead, clearNotifications };
}
