// Open Banking through GoCardless Bank Account Data (new sign-ups are closed; kept for existing users).
import { randomUUID } from "node:crypto";
import type { Institution, Transaction } from "../shared/types.ts";
import type { Runtime } from "../core/Runtime.ts";
import type { AccountService } from "../accounts/AccountService.ts";
import type { Categorizer } from "../categories/categorizer/Categorizer.ts";
import type { RuleService } from "../categories/RuleService.ts";
import type { SettingsRepository } from "../settings/SettingsRepository.ts";
import { TransactionFactory } from "../transactions/TransactionFactory.ts";
import type { BankProvider, FetchedTransactions } from "./BankProvider.ts";
import { ProviderHttp } from "./ProviderHttp.ts";

const API = "https://bankaccountdata.gocardless.com/api/v2";
const PKO_INSTITUTION_ID = "PKO_BPKOPLPW";
const SANDBOX_INSTITUTION_ID = "SANDBOXFINANCE_SFIN0000";
const TOKEN = "gocardless_token";
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

type TokenPayload = { access: string; refresh: string; access_expires?: number; obtainedAt: number };

type GcTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount?: string; currency?: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  additionalInformation?: string;
};

export type GoCardlessConnect = { redirect: string; sandbox: boolean; institutionId?: string; institutionName?: string };

export class GoCardlessProvider implements BankProvider {
  readonly #settings: SettingsRepository;
  readonly #runtime: Runtime;
  readonly #accounts: AccountService;
  readonly #rules: RuleService;
  readonly #http = new ProviderHttp("GoCardless", (body) => (body && "detail" in body ? String(body.detail) : ""));

  constructor(settings: SettingsRepository, runtime: Runtime, accounts: AccountService, rules: RuleService) {
    this.#settings = settings;
    this.#runtime = runtime;
    this.#accounts = accounts;
    this.#rules = rules;
  }

  status() {
    const { secretId, secretKey } = this.#secrets();
    return {
      hasSecrets: Boolean(secretId && secretKey),
      requisitionId: this.#settings.get("gocardless_requisition_id") || null,
      institutionId: this.#settings.get("gocardless_institution_id") || null,
      institutionName: this.#settings.get("gocardless_institution_name") || null,
    };
  }

  saveSecrets(secretId: string, secretKey: string): void {
    const id = secretId.trim();
    const key = secretKey.trim();
    if (!id || !key) throw new Error("Podaj Secret ID i Secret Key z portalu GoCardless.");
    this.#settings.set("gocardless_secret_id", id);
    this.#settings.set("gocardless_secret_key", key);
    this.#settings.set(TOKEN, "");
  }

  async listInstitutions(): Promise<Institution[]> {
    const token = await this.#token();
    const rows = (await this.#fetch("/institutions/?country=pl", {}, token)) as { id: string; name: string; logo?: string }[];
    return ProviderHttp.sortInstitutions(rows.map((row) => ({ id: row.id, name: row.name, logo: row.logo || "" })));
  }

  async start(options: GoCardlessConnect): Promise<{ link: string; requisitionId: string }> {
    const token = await this.#token();
    const institutionId = options.sandbox ? SANDBOX_INSTITUTION_ID : options.institutionId || PKO_INSTITUTION_ID;
    this.#settings.set("gocardless_institution_name", options.sandbox ? "Sandbox" : options.institutionName || "PKO BP");
    const agreement = (await this.#fetch(
      "/agreements/enduser/",
      {
        method: "POST",
        body: JSON.stringify({
          institution_id: institutionId,
          max_historical_days: 90,
          access_valid_for_days: 90,
          access_scope: ["balances", "details", "transactions"],
        }),
      },
      token,
    )) as { id: string };

    const requisition = (await this.#fetch(
      "/requisitions/",
      {
        method: "POST",
        body: JSON.stringify({
          redirect: options.redirect,
          institution_id: institutionId,
          agreement: agreement.id,
          reference: randomUUID(),
          user_language: "PL",
        }),
      },
      token,
    )) as { id: string; link: string };

    this.#settings.set("gocardless_requisition_id", requisition.id);
    this.#settings.set("gocardless_institution_id", institutionId);
    return { link: requisition.link, requisitionId: requisition.id };
  }

  async fetchTransactions(): Promise<FetchedTransactions> {
    const requisitionId = this.#settings.get("gocardless_requisition_id");
    if (!requisitionId) throw new Error("Brak połączenia z bankiem. Najpierw zaloguj się w banku przez GoCardless.");
    const token = await this.#token();
    const requisition = (await this.#fetch(`/requisitions/${requisitionId}/`, {}, token)) as {
      accounts?: string[];
      status?: string;
    };
    if (!requisition.accounts?.length) {
      throw new Error(
        requisition.status === "LN"
          ? "Połączenie w toku. Dokończ logowanie w oknie banku."
          : "Bank nie zwrócił żadnego konta. Spróbuj połączyć się ponownie.",
      );
    }

    const categorizer = this.#rules.categorizer();
    const bank = this.#settings.get("gocardless_institution_name") || "PKO BP";
    const imported: Transaction[] = [];
    for (const accountId of requisition.accounts) {
      const details = (await this.#fetch(`/accounts/${accountId}/details/`, {}, token)) as {
        account?: { iban?: string; name?: string; currency?: string; ownerName?: string };
      };
      const iban = details.account?.iban || "";
      const local = this.#accounts.upsertLinked("gocardless", accountId, { bank, iban, label: details.account?.name });
      const payload = (await this.#fetch(`/accounts/${accountId}/transactions/`, {}, token)) as {
        transactions?: { booked?: GcTransaction[]; pending?: GcTransaction[] };
      };
      const booked = payload.transactions?.booked || [];
      imported.push(...booked.map((item) => GoCardlessProvider.#map(item, iban, local.id, categorizer)));
    }
    return { imported, accounts: requisition.accounts.length };
  }

  #secrets() {
    const secretId = this.#settings.get("gocardless_secret_id") || this.#runtime.env("GOCARDLESS_SECRET_ID");
    const secretKey = this.#settings.get("gocardless_secret_key") || this.#runtime.env("GOCARDLESS_SECRET_KEY");
    return { secretId, secretKey };
  }

  #fetch(path: string, init: RequestInit = {}, token?: string): Promise<unknown> {
    const headers = { ...(init.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return this.#http.fetch(`${API}${path}`, { ...init, headers });
  }

  #saveToken(access: string, refresh: string): string {
    this.#settings.setJson(TOKEN, { access, refresh, obtainedAt: Date.now() } satisfies TokenPayload);
    return access;
  }

  async #token(): Promise<string> {
    const cached = this.#settings.getJson<TokenPayload | null>(TOKEN, null);
    if (cached) {
      try {
        if (cached.access && Date.now() - cached.obtainedAt < TOKEN_TTL_MS) return cached.access;
        if (cached.refresh) {
          const refreshed = (await this.#fetch("/token/refresh/", {
            method: "POST",
            body: JSON.stringify({ refresh: cached.refresh }),
          })) as TokenPayload;
          return this.#saveToken(refreshed.access, refreshed.refresh || cached.refresh);
        }
      } catch {
        // fetch a fresh token
      }
    }

    const { secretId, secretKey } = this.#secrets();
    if (!secretId || !secretKey) {
      throw new Error("Brak kluczy GoCardless. Wklej Secret ID i Secret Key w ustawieniach banku.");
    }
    const token = (await this.#fetch("/token/new/", {
      method: "POST",
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    })) as TokenPayload;
    return this.#saveToken(token.access, token.refresh);
  }

  static #map(raw: GcTransaction, iban: string, accountId: string, categorizer: Categorizer): Transaction {
    const amount = Number(raw.transactionAmount?.amount || 0);
    const payee = raw.creditorName || raw.debtorName || "";
    const title = raw.remittanceInformationUnstructured || "";
    const description = [raw.additionalInformation, raw.remittanceInformationUnstructured].filter(Boolean).join("\n");
    const bookingDate = raw.bookingDate || raw.valueDate || TransactionFactory.utcDay();
    const external = raw.transactionId || raw.internalTransactionId || TransactionFactory.hashId([bookingDate, amount, payee, title]);
    const draft = { payee, title, description, type: "Open Banking", amount };
    return TransactionFactory.create({
      ...draft,
      id: TransactionFactory.hashId(["gc", external]),
      date: raw.valueDate || bookingDate,
      bookingDate,
      currency: raw.transactionAmount?.currency,
      accountIban: iban,
      accountId,
      category: categorizer.categorize(draft),
      source: "gocardless",
      externalId: `gc:${external}`,
    });
  }
}
