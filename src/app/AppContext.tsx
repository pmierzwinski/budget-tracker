// App-wide state: /api/meta (accounts, banks, categories, limits, rules, counters, AI key, app mode),
// the active account and navigation. Pages read it with useApp() instead of fetching /meta themselves.
import { createContext, useContext } from "react";
import type { Meta } from "../types";
import type { Navigate } from "./navigation";
import type { AppNotification, NotificationDraft } from "./notifications";

export type AppState = {
  meta: Meta;
  /** Refetches /meta (after changes to categories, limits, accounts, AI key…) without remounting the page. */
  refreshMeta: () => Promise<Meta>;
  /** Active account id, "" = all accounts. */
  account: string;
  chooseAccount: (id: string) => void;
  /** Refreshes /meta and remounts the current page (e.g. after demo data was generated). */
  reloadPage: () => Promise<void>;
  navigate: Navigate;
  notifications: AppNotification[];
  notify: (draft: NotificationDraft) => void;
  markRead: (id: string) => void;
  clearNotifications: () => void;
  openNotification: (item: AppNotification) => void;
  /** Search hint for Płatności after opening a notification. */
  txQuery: string;
  clearTxQuery: () => void;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp() poza <AppContext>");
  return state;
}
