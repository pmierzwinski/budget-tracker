import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

if (process.platform !== "win32") {
  console.error("Paczkę dla Windows trzeba budować na Windows (używa node.exe z tego komputera).");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, "build", "win");
const release = join(root, "release");
const appDir = join(release, "Wydatki");
const zip = join(release, "Wydatki-Windows.zip");
const exe = join(appDir, "Wydatki.exe");

rmSync(work, { recursive: true, force: true });
rmSync(appDir, { recursive: true, force: true });
rmSync(zip, { force: true });
mkdirSync(work, { recursive: true });
mkdirSync(appDir, { recursive: true });

console.log("1/5 Frontend (vite build)…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("2/5 Serwer w jednym pliku (esbuild)…");
await build({
  entryPoints: [join(root, "server", "index.ts")],
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

console.log("3/5 Blob aplikacji (Node SEA)…");
const seaConfig = join(work, "sea-config.json");
const blob = join(work, "sea-prep.blob");
writeFileSync(
  seaConfig,
  JSON.stringify({ main: join(work, "server.cjs"), output: blob, disableExperimentalSEAWarning: true }, null, 2),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

console.log("4/5 Wydatki.exe…");
copyFileSync(process.execPath, exe);
execFileSync(
  process.execPath,
  [
    require.resolve("postject/dist/cli.js"),
    exe,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { stdio: "inherit" },
);
cpSync(join(root, "dist"), join(appDir, "dist"), { recursive: true });
writeFileSync(
  join(appDir, "CZYTAJ.txt"),
  [
    "Wydatki — analiza wydatków z konta",
    "",
    "1. Kliknij dwukrotnie Wydatki.exe.",
    "2. Otworzy się okno konsoli (to serwer aplikacji) i przeglądarka z aplikacją.",
    "3. Żeby zakończyć, zamknij okno konsoli.",
    "",
    "Dane zapisują się w folderze „data” obok Wydatki.exe i nigdzie nie są wysyłane.",
    "Kopia zapasowa = skopiuj folder „data”. Nowa wersja = podmień Wydatki.exe i folder „dist”.",
    "",
    "Windows może ostrzec, że aplikacja pochodzi od nieznanego wydawcy (nie jest podpisana):",
    "kliknij „Więcej informacji” → „Uruchom mimo to”.",
    "",
  ].join("\r\n"),
  "utf8",
);

console.log("5/5 Zip…");
execFileSync("tar.exe", ["-a", "-c", "-f", zip, "-C", release, "Wydatki"], { stdio: "inherit" });

const size = (statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`\nGotowe: ${zip} (${size} MB)`);
console.log("Serwer udostępnia go pod /download/Wydatki-Windows.zip (albo ustaw DOWNLOAD_URL).");
