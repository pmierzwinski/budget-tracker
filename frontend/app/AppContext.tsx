// App-wide state (built by getAppContext). Pages read it with getContext().
import { createContext, useContext } from "react";
import type { Meta } from "../../shared/types";
import type { Database } from "../db";
import type { NotificationDraft, AppNotification } from "../modules/notifications";
import type { Navigate, Page, SettingsTab } from "./PageManager";

export type AppState = {
  /** All data. Read `database.data`, change with `database.update(...)` — the app re-renders after every change. */
  database: Database;
  /** AI defaults from `.env` (computer version only). */
  env: Record<string, string>;
  /** Computed from the data for the active account: counters, categories, accounts, app mode. */
  meta: Meta;
  /** Active account id, "" = all accounts. */
  account: string;
  chooseAccount: (id: string) => void;
  /** Remounts the current page (e.g. after demo data was generated). */
  reloadPage: () => void;
  /** Open screen; `key` remounts it when the account changes or reloadPage runs. */
  currentPage: { id: Page; key: string };
  navigate: Navigate;
  /** Open tab of Ustawienia; switch it with navigate("settings", tab). */
  settingsTab: SettingsTab;
  notifications: AppNotification[];
  notify: (draft: NotificationDraft) => void;
  markRead: (id: string) => void;
  clearNotifications: () => void;
  /** One-shot search handed to Płatności (e.g. after opening a notification). */
  paymentsSearch: string;
  setPaymentsSearch: (query: string) => void;
  clearPaymentsSearch: () => void;
};

export const AppContext = createContext<AppState | null>(null);

export function getContext(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("getContext() poza <AppContext>");
  return state;
}
