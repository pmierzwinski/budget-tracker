import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("Ten skrypt woła gradlew.bat — buduj APK na Windows albo uruchom ./gradlew assembleDebug w android/.");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const javaHome = existing(process.env.JAVA_HOME) || existing("C:\\Program Files\\Java\\jdk-22") || existing("C:\\Program Files\\Java\\jdk-17.0.4.1");

if (!existsSync(join(sdk, "platforms"))) {
  console.error(`Nie ma Android SDK w ${sdk}. Zainstaluj Android Studio i uruchom skrypt jeszcze raz.`);
  process.exit(1);
}
if (!javaHome) {
  console.error("Nie ma JDK 17+. Ustaw JAVA_HOME.");
  process.exit(1);
}

console.log("1/2 Aplikacja (vite + cap sync)…");
execSync("npm run build:android", { cwd: root, stdio: "inherit" });

const sdkDir = sdk.replace(/\\/g, "/");
writeFileSync(join(root, "android", "local.properties"), `sdk.dir=${sdkDir}\r\n`, "utf8");

console.log("2/2 APK (gradlew assembleDebug)…");
execSync("gradlew.bat assembleDebug", {
  cwd: join(root, "android"),
  stdio: "inherit",
  env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk },
});

const apk = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const out = join(root, "release");
mkdirSync(out, { recursive: true });
const dest = join(out, "Wydatki.apk");
copyFileSync(apk, dest);
const size = (statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\nGotowe: ${dest} (${size} MB)`);
console.log("Skopiuj plik na telefon i otwórz go. Android zapyta, czy instalować aplikację spoza sklepu.");

function existing(dir) {
  return dir && existsSync(join(dir, "bin", "java.exe")) ? dir : "";
}
