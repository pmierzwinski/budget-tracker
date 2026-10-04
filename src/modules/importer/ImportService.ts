import { DEFAULT_CATEGORY } from "../shared/domain.ts";
import type { DemoResult, ImportPreview, ImportResult } from "../shared/types.ts";
import { AccountService } from "../accounts/AccountService.ts";
import type { AiCategorizationService } from "../ai/AiCategorizationService.ts";
import type { RuleService } from "../categories/RuleService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import { bankName } from "./csv/banks.ts";
import type { CsvStatementParser } from "./csv/CsvStatementParser.ts";
import type { DemoGenerator } from "./demo/DemoGenerator.ts";

export const DEMO_ACCOUNT = "Konto testowe";
export const DEMO_RAW_ACCOUNT = "Konto testowe bez kategorii";

export type CsvImportRequest = {
  file: Buffer;
  /** `auto`, `new` or an account id. */
  account: string;
  accountName?: string;
  bank?: string;
  replaceCsv?: boolean;
  ai?: boolean;
};

/** Puts payments into the database: CSV statements and the demo account. */
export class ImportService {
  readonly #parser: CsvStatementParser;
  readonly #demo: DemoGenerator;
  readonly #transactions: TransactionRepository;
  readonly #accounts: AccountService;
  readonly #rules: RuleService;
  readonly #ai: AiCategorizationService;

  constructor(
    parser: CsvStatementParser,
    demo: DemoGenerator,
    transactions: TransactionRepository,
    accounts: AccountService,
    rules: RuleService,
    ai: AiCategorizationService,
  ) {
    this.#parser = parser;
    this.#demo = demo;
    this.#transactions = transactions;
    this.#accounts = accounts;
    this.#rules = rules;
    this.#ai = ai;
  }

  /** Re-importing the same file skips duplicates; `replaceCsv` first drops the account's CSV payments. */
  async importCsv(request: CsvImportRequest): Promise<ImportResult> {
    const parsed = this.#parser.parse(request.file, { bank: request.bank, categorizer: this.#rules.categorizer() });
    const account = this.#accounts.resolveImport(request.account, {
      bank: parsed.bank,
      iban: parsed.iban,
      bankName: bankName(parsed.bank),
      accountName: request.accountName,
    });
    const items = parsed.items.map((item) => ({ ...item, accountId: account.id }));
    const result = this.#transactions.insertMany(items, { replaceCsvFor: request.replaceCsv ? account.id : undefined });
    const ai = request.ai && result.ids.length ? await this.#ai.categorize(result.ids) : null;
    return {
      ...result,
      total: items.length,
      ai,
      bank: parsed.bank,
      bankName: bankName(parsed.bank),
      account: this.#accounts.get(account.id)!,
      accounts: this.#accounts.list(),
      ...this.#transactions.dateBounds(account.id),
    };
  }

  /** Parses the file and reports what `importCsv` would add, without touching the database. */
  previewCsv(request: Omit<CsvImportRequest, "ai">): ImportPreview {
    const parsed = this.#parser.parse(request.file, { bank: request.bank, categorizer: this.#rules.categorizer() });
    const file = { bank: parsed.bank, iban: parsed.iban, bankName: bankName(parsed.bank), accountName: request.accountName };
    const account = this.#accounts.matchImport(request.account, file);
    const existing = this.#transactions.existingIds(
      parsed.items.map((item) => item.id),
      { replaceCsvFor: request.replaceCsv && account ? account.id : undefined },
    );
    const fresh = parsed.items.filter((item) => !existing.has(item.id));
    const dates = parsed.items.map((item) => item.date).sort();
    return {
      total: parsed.items.length,
      fresh: fresh.length,
      duplicates: parsed.items.length - fresh.length,
      categorized: fresh.filter((item) => item.category && item.category !== DEFAULT_CATEGORY).length,
      bank: parsed.bank,
      bankName: file.bankName,
      account: account
        ? { id: account.id, name: account.name }
        : { id: "", name: AccountService.importName(request.account, file) },
      minDate: dates[0] || "",
      maxDate: dates.at(-1) || "",
    };
  }

  /** Recreates the demo account (by name); `uncategorized` puts everything in "Inne" to try rules and AI. */
  resetDemo(options: { uncategorized?: boolean } = {}): DemoResult {
    const name = options.uncategorized ? DEMO_RAW_ACCOUNT : DEMO_ACCOUNT;
    this.#accounts.deleteByName(name);
    const account = this.#accounts.create({ name, bank: "generic" });
    const items = this.#demo.generate(account.id, { categorizer: this.#rules.categorizer(), uncategorized: options.uncategorized });
    const result = this.#transactions.insertMany(items);
    return {
      ...result,
      total: items.length,
      account: this.#accounts.get(account.id)!,
      accounts: this.#accounts.list(),
      ...this.#transactions.dateBounds(),
    };
  }
}
