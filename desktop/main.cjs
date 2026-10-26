// Windowed Windows app. The Express server runs in this process; the window shows it.
const { app, BrowserWindow, Menu, dialog } = require("electron");
const { join } = require("node:path");

app.setName("Wydatki");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(boot).catch((error) => {
  dialog.showErrorBox("Wydatki", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

app.on("window-all-closed", () => process.exit(0));

async function boot() {
  Menu.setApplicationMenu(null);
  const root = app.getAppPath();
  process.env.WYDATKI_DESKTOP = "1";
  process.env.WYDATKI_NO_BROWSER = "1";
  process.env.WYDATKI_ROOT = app.getPath("userData");
  process.env.WYDATKI_DIST = join(root, "dist");
  const { start } = require(join(root, "build", "win", "server.cjs"));
  const port = await start();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 640,
    title: "Wydatki",
    backgroundColor: "#f5f6f8",
    show: false,
    autoHideMenuBar: true,
    icon: join(root, "desktop", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  await win.loadURL(`http://127.0.0.1:${port}`);
}
