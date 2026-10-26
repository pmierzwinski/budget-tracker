// The welcome dialog and the starting-category choice, each once per browser.
const WELCOME_SEEN = "wydatki.welcome-seen";
const CATEGORIES_SETUP = "wydatki.categories-setup";

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

export function welcomeSeen(): boolean {
  return read(WELCOME_SEEN);
}

export function markWelcomeSeen() {
  write(WELCOME_SEEN, true);
}

/** The starting-category choice, asked once after the welcome dialog. */
export function categoriesSetup(): boolean {
  return read(CATEGORIES_SETUP);
}

export function markCategoriesSetup() {
  write(CATEGORIES_SETUP, true);
}
