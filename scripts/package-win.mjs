import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

if (process.platform !== "win32") {
  console.error("Instalator Windows trzeba budować na Windows.");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, "build", "win");
const setup = join(root, "release", "Wydatki-Setup.exe");

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

console.log("1/3 Frontend (vite build)…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("2/3 Serwer w jednym pliku (esbuild)…");
await build({
  entryPoints: [join(root, "server", "main.ts")],
  outfile: join(work, "server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  banner: {
    js: [
      'process.removeAllListeners("warning");',
      'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;',
    ].join("\n"),
  },
  define: { "import.meta.url": "__importMetaUrl" },
  logLevel: "warning",
});

console.log("3/3 Instalator…");
execFileSync(process.execPath, [join(root, "node_modules", "electron-builder", "cli.js"), "--win", "nsis"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
});

const size = (statSync(setup).size / 1024 / 1024).toFixed(1);
console.log(`\nGotowe: ${setup} (${size} MB)`);
console.log("Uruchom ten plik, żeby zainstalować Wydatki (własne okno, skrót w menu Start).");
