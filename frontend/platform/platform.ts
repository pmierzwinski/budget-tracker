import type { AppInfo, AppMode } from "../../shared/types";
import { isShowcase } from "./showcase";

// Where the app runs and what that allows. One frontend, four builds:
//   local    `npm run dev` / `npm start`            data file via the Node server on this computer
//   desktop  Wydatki.exe / Wydatki.cmd (Windows)    the same server on 127.0.0.1, console window
//   web      `npm run build:web` (GitHub Pages)     data in this browser (IndexedDB), no server
//   android  `npm run build:android` (Play)         data in the WebView, like web
// The build picks the database (db/index.ts); the mode comes from environment.ts (meta.app.mode).
// This is the only place that turns the mode into features — components ask `platform(app).bank`, not the mode.

export type Platform = {
  mode: AppMode;
  /** No server: the data lives on this device only (web, Android). */
  onDevice: boolean;
  /** Bank connection needs the local server (app keys, return from the bank's page). */
  bank: boolean;
  /** "Zamknij aplikację" — only the exe / Wydatki.cmd keeps a console window running. */
  shutdown: boolean;
  /** "Pobierz aplikację" buttons (showcase.ts). */
  showcase: boolean;
  /** Settings → App can switch showcase mode on and off (on a computer). */
  showcaseSwitch: boolean;
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
    bank: !onDevice,
    shutdown: app.mode === "desktop",
    showcase: isShowcase(app),
    showcaseSwitch: !onDevice,
    trial: app.mode === "web",
    phone: app.mode === "android",
  };
}
