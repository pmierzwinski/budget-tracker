// The server's composition root: data/wydatki.db through node:sqlite, multer for uploads and the bank connection
// on top of the shared Modules.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import multer from "multer";
import { BankingController } from "../banking/BankingController.ts";
import { BankingService } from "../banking/BankingService.ts";
import { EnableBankingProvider } from "../banking/EnableBankingProvider.ts";
import { GoCardlessProvider } from "../banking/GoCardlessProvider.ts";
import type { Controller } from "../core/Controller.ts";
import { Database } from "../core/Database.ts";
import { Runtime } from "../core/Runtime.ts";
import { Modules } from "./Modules.ts";

export class Container {
  readonly runtime: Runtime;
  readonly database: Database;
  readonly controllers: Controller[];

  constructor(runtime = new Runtime()) {
    this.runtime = runtime;
    const database = (this.database = new Database(() => {
      const dataDir = join(runtime.appRoot, "data");
      mkdirSync(dataDir, { recursive: true });
      return new DatabaseSync(join(dataDir, "wydatki.db"));
    }));
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }).single("file");
    const modules = new Modules(database, runtime, upload);
    const { settings, accounts, rules, transactions } = modules;

    const banking = new BankingService(
      new EnableBankingProvider(settings, runtime, accounts, rules),
      new GoCardlessProvider(settings, runtime, accounts, rules),
      accounts,
      transactions,
    );
    this.controllers = [...modules.controllers, new BankingController(banking, runtime)];
  }
}
