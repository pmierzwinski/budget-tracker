// Entry point: starts the server. In the packaged exe it listens on 127.0.0.1, opens the browser and, when the
// port is taken by another copy of Wydatki, just opens the browser (a foreign app → next port, up to 10).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { app } from "./app.ts";
import { hosted, packaged, port } from "./runtime.ts";

function openBrowser(url: string) {
  if (process.env.WYDATKI_NO_BROWSER === "1") return;
  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function runningHere(candidate: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${candidate}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).app === "wydatki";
  } catch {
    return false;
  }
}

function listen(candidate: number, attempts: number) {
  const server = createServer(app);
  server.listen({ port: candidate, host: packaged ? "127.0.0.1" : undefined }, () => {
    const url = `http://127.0.0.1:${candidate}`;
    if (packaged) {
      console.log(`Wydatki działa: ${url}`);
      console.log("Dane zapisują się w folderze „data” obok programu. Zamknij to okno, żeby wyłączyć aplikację.");
      openBrowser(url);
    } else {
      console.log(`Wydatki API: http://127.0.0.1:${candidate}${hosted ? " (tryb online, osobne dane dla każdej sesji)" : ""}`);
    }
  });
  server.on("error", async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE" || !packaged || attempts <= 0) throw error;
    if (await runningHere(candidate)) {
      console.log("Wydatki już działają — otwieram przeglądarkę.");
      openBrowser(`http://127.0.0.1:${candidate}`);
      setTimeout(() => process.exit(0), 500);
      return;
    }
    listen(candidate + 1, attempts - 1);
  });
}

listen(port, 10);
