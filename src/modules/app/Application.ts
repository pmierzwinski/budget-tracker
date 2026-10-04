// The Express app: middleware, API controllers, download and the built frontend.
import cors from "cors";
import express, { Router, type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOWNLOAD_FILE } from "../core/Runtime.ts";
import type { Container } from "./Container.ts";

export class Application {
  readonly express: Express;

  constructor(container: Container) {
    const { runtime, sessions, controllers } = container;
    const app = (this.express = express());

    if (runtime.hosted) {
      app.set("trust proxy", true);
      app.use("/api", (req, res, next) => (req.path === "/health" ? next() : sessions.scope(req, res, next)));
      app.use("/api/bank", (_req, res) => {
        res.status(403).json({ error: "W wersji online połączenie z bankiem jest wyłączone — pobierz aplikację." });
      });
    } else {
      app.use(cors());
    }
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
