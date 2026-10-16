import type { Request, RequestHandler, Router } from "express";
import type { ImportPreview, ImportResult } from "../shared/types.ts";
import { Controller, RequestReader } from "../core/Controller.ts";
import type { DataResetService } from "./DataResetService.ts";
import type { CsvImportRequest, ImportService } from "./ImportService.ts";

const { text } = RequestReader;

export class ImporterController extends Controller {
  readonly #imports: ImportService;
  readonly #reset: DataResetService;
  readonly #upload: RequestHandler;

  /** `upload` puts the multipart `file` on `req.file` (multer on the server; the web version passes it directly). */
  constructor(imports: ImportService, reset: DataResetService, upload: RequestHandler) {
    super();
    this.#imports = imports;
    this.#reset = reset;
    this.#upload = upload;
  }

  register(router: Router): void {
    router.post(
      "/import/preview",
      this.#upload,
      this.handle("Nie udało się odczytać pliku", (req) =>
        this.#imports.previewCsv(ImporterController.#csvRequest(req)) satisfies ImportPreview,
      ),
    );

    router.post(
      "/import",
      this.#upload,
      this.handle("Import nie powiódł się", async (req) =>
        (await this.#imports.importCsv(ImporterController.#csvRequest(req))) satisfies ImportResult,
      ),
    );

    router.post(
      "/import/demo",
      this.handle("Nie udało się wczytać przykładu", (req) =>
        this.#imports.resetDemo({ uncategorized: Boolean(req.body?.uncategorized) }),
      ),
    );

    router.post(
      "/recategorize",
      this.handle("Nie przeliczono kategorii", () => this.#reset.recategorize()),
    );

    router.delete(
      "/data",
      this.handle("Nie usunięto danych", (req) => {
        if (text(req.query.all) === "1") this.#reset.resetAll();
        else this.#reset.clearPayments();
        return { ok: true };
      }),
    );
  }

  static #csvRequest(req: Request & { file?: { buffer: Uint8Array } }): CsvImportRequest {
    if (!req.file?.buffer) throw new Error("Wybierz plik CSV z bankowości.");
    return {
      file: req.file.buffer,
      account: String(req.body?.account || "auto"),
      accountName: text(req.body?.accountName),
      bank: text(req.body?.bank) || undefined,
      replaceCsv: text(req.body?.replaceCsv) === "1",
      ai: text(req.body?.ai) === "1",
    };
  }
}
