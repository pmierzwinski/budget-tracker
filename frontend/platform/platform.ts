import type { AppInfo, AppMode } from "../../shared/types";

// Where the app runs and what that allows. One frontend, four builds:
//   local    `npm run dev` / `npm start`            data file via the Node server on this computer
//   desktop  windowed Windows app / Wydatki.cmd     the same server on 127.0.0.1
//   web      `npm run build:web` (GitHub Pages)     data in this browser (IndexedDB), no server
//   android  `npm run build:android` (Play)         data in the WebView, like web
// The build picks the database (db/index.ts); the mode comes from environment.ts (meta.app.mode).
// This is the only place that turns the mode into features — components ask `platform(app).shutdown`, not the mode.

export type Platform = {
  mode: AppMode;
  /** No server: the data lives on this device only (web, Android). */
  onDevice: boolean;
  /** "Zamknij aplikację" — the windowed app and Wydatki.cmd. */
  shutdown: boolean;
  /** "Pobierz aplikację" — only the web build. Windows (local/desktop) and Android never show it. */
  showcase: boolean;
  /** Public web version — visitors try the app before downloading it. */
  trial: boolean;
  /** Android app. */
  phone: boolean;
};

export function platform(app: AppInfo): Platform {
  const onDevice = app.mode === "web" || app.mode === "android";
  return {
    mode: app.mode,
    onDevice,
    shutdown: app.mode === "desktop",
    showcase: app.showDownload,
    trial: app.mode === "web",
    phone: app.mode === "android",
  };
}
