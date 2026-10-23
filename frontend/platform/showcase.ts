import type { AppInfo } from "../../shared/types";

// Showcase mode = the "download the app" button. Always on in the web version, never in the Android app; locally a
// switch in Settings → App (per browser) to preview what visitors see. The welcome dialog shows everywhere, once.
const SHOWCASE = "wydatki.showcase";
const WELCOME_SEEN = "wydatki.welcome-seen";

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the switch just doesn't stick.
  }
}

export function showcaseSwitch(): boolean {
  return read(SHOWCASE);
}

export function isShowcase(app: AppInfo): boolean {
  if (app.mode === "web") return true;
  if (app.mode === "android") return false;
  return read(SHOWCASE);
}

/** Turning it on also shows the welcome dialog again. */
export function setShowcase(on: boolean) {
  write(SHOWCASE, on);
  if (on) write(WELCOME_SEEN, false);
}

export function welcomeSeen(): boolean {
  return read(WELCOME_SEEN);
}

export function markWelcomeSeen() {
  write(WELCOME_SEEN, true);
}
