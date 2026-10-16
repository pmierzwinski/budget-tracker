// Entry point: starts the server. On the desktop (exe or Wydatki.cmd) it listens on 127.0.0.1, opens the browser and,
// when the port is taken by another copy of Wydatki, just opens the browser (a foreign app → next port, up to 10).
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Application } from "./Application.ts";
import { Container } from "./Container.ts";

class Server {
  readonly #container: Container;
  readonly #app: Application;

  constructor(container: Container) {
    this.#container = container;
    this.#app = new Application(container);
  }

  start(): void {
    this.#listen(this.#container.runtime.port, 10);
  }

  #listen(candidate: number, attempts: number): void {
    const { desktop } = this.#container.runtime;
    const server = createServer(this.#app.express);
    server.listen({ port: candidate, host: desktop ? "127.0.0.1" : undefined }, () => {
      const url = `http://127.0.0.1:${candidate}`;
      if (desktop) {
        console.log(`Wydatki działa: ${url}`);
        console.log("Dane zapisują się w folderze „data” obok programu.");
        console.log("Żeby wyłączyć: „Zamknij aplikację” w menu po lewej albo zamknij to okno.");
        Server.#openBrowser(url);
      } else {
        console.log(`Wydatki API: http://127.0.0.1:${candidate}`);
      }
    });
    server.on("error", async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") throw error;
      if (desktop && attempts > 0) {
        if (await Server.#runningHere(candidate)) {
          console.log("Wydatki już działają — otwieram przeglądarkę.");
          Server.#openBrowser(`http://127.0.0.1:${candidate}`);
          setTimeout(() => process.exit(0), 500);
          return;
        }
        this.#listen(candidate + 1, attempts - 1);
        return;
      }
      console.error(`Port ${candidate} jest zajęty. Zamknij inną instancję albo uruchom z PORT=${candidate + 1}.`);
      process.exit(1);
    });
  }

  static #openBrowser(url: string): void {
    if (process.env.WYDATKI_NO_BROWSER === "1") return;
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }

  static async #runningHere(candidate: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${candidate}/api/health`, { signal: AbortSignal.timeout(1500) });
      return response.ok && (await response.json()).app === "wydatki";
    } catch {
      return false;
    }
  }
}

new Server(new Container()).start();
