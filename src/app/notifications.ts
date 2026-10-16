import type { Page } from "./navigation";

export type NotificationType = "category_changed";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  page?: Page;
  q?: string;
};

export type NotificationDraft = Omit<AppNotification, "id" | "createdAt" | "read">;

const KEY = "wydatki.notifications";
const MAX = 20;

export function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveNotifications(items: AppNotification[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // private mode
  }
}

export function makeNotification(draft: NotificationDraft): AppNotification {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  return { ...draft, id, createdAt: Date.now(), read: false };
}
