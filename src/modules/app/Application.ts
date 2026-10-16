// The Express app: middleware, API controllers, download, shutdown (desktop) and the built frontend.
import cors from "cors";
import express, { Router, type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOWNLOAD_FILE } from "../core/AppEnvironment.ts";
import type { Container } from "./Container.ts";

export class Application {
  readonly express: Express;

  constructor(container: Container) {
    const { runtime, controllers } = container;
    const app = (this.express = express());

    app.use(cors());
    app.use(express.json({ limit: "2mb" }));

    app.get(`/download/${DOWNLOAD_FILE}`, (_req, res) => {
      const file = join(runtime.releaseDir, DOWNLOAD_FILE);
      if (!existsSync(file)) {
        res.status(404).send("Paczka aplikacji nie jest jeszcze zbudowana (npm run package:win).");
        return;
      }
      res.download(file, DOWNLOAD_FILE);
    });

    app.get("/api/health", (_req, res) => {
      res.json({ ok: true, app: "wydatki" });
    });

    if (runtime.desktop) {
      app.post("/api/shutdown", (_req, res) => {
        res.json({ ok: true });
        console.log("Zamknięto z aplikacji.");
        setTimeout(() => process.exit(0), 200);
      });
    }

    const api = Router();
    for (const controller of controllers) controller.register(api);
    app.use("/api", api);

    if (existsSync(runtime.dist)) {
      app.use(express.static(runtime.dist));
      app.get(/.*/, (_req, res) => {
        res.sendFile(join(runtime.dist, "index.html"));
      });
    }
  }
}
