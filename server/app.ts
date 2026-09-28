// The Express app: middleware, API routers, download and the built frontend.
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOWNLOAD_FILE, dist, hosted, releaseDir } from "./runtime.ts";
import { accountRoutes } from "./routes/accounts.ts";
import { aiRoutes } from "./routes/ai.ts";
import { bankRoutes } from "./routes/bank.ts";
import { categoryRoutes } from "./routes/categories.ts";
import { dataRoutes } from "./routes/data.ts";
import { sessionScope } from "./sessions.ts";

export const app = express();

if (hosted) {
  app.set("trust proxy", true);
  app.use("/api", (req, res, next) => (req.path === "/health" ? next() : sessionScope(req, res, next)));
  app.use("/api/bank", (_req, res) => {
    res.status(403).json({ error: "W wersji online połączenie z bankiem jest wyłączone — pobierz aplikację." });
  });
} else {
  app.use(cors());
}
app.use(express.json({ limit: "2mb" }));

app.get(`/download/${DOWNLOAD_FILE}`, (_req, res) => {
  const file = join(releaseDir, DOWNLOAD_FILE);
  if (!existsSync(file)) {
    res.status(404).send("Paczka aplikacji nie jest jeszcze zbudowana (npm run package:win).");
    return;
  }
  res.download(file, DOWNLOAD_FILE);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "wydatki" });
});

app.use("/api", dataRoutes, categoryRoutes, accountRoutes, aiRoutes, bankRoutes);

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
}
