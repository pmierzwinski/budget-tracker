import type { SyncResult } from "../shared/types.ts";
import type { AccountService } from "../accounts/AccountService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import type { BankProvider } from "./BankProvider.ts";
import type { EnableBankingProvider } from "./EnableBankingProvider.ts";
import type { GoCardlessProvider } from "./GoCardlessProvider.ts";

/** Open Banking: connection status of both providers and storing what a sync fetched. */
export class BankingService {
  readonly enableBanking: EnableBankingProvider;
  readonly goCardless: GoCardlessProvider;
  readonly #accounts: AccountService;
  readonly #transactions: TransactionRepository;

  constructor(
    enableBanking: EnableBankingProvider,
    goCardless: GoCardlessProvider,
    accounts: AccountService,
    transactions: TransactionRepository,
  ) {
    this.enableBanking = enableBanking;
    this.goCardless = goCardless;
    this.#accounts = accounts;
    this.#transactions = transactions;
  }

  status() {
    return {
      gocardless: this.goCardless.status(),
      enablebanking: this.enableBanking.status(),
      accounts: this.#accounts.list().filter((account) => account.provider),
    };
  }

  async sync(provider: BankProvider): Promise<SyncResult> {
    const { imported, accounts } = await provider.fetchTransactions();
    return { ...this.#transactions.insertMany(imported), accounts, total: imported.length };
  }
}
