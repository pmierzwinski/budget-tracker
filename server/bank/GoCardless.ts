// Open Banking through GoCardless Bank Account Data (new sign-ups are closed; kept for existing users).
import { randomUUID } from "node:crypto";
import { hashId } from "../../shared/sha256.ts";
import type { BankFetch, BankTransaction, Institution } from "../../shared/types.ts";
import type { Runtime } from "../Runtime.ts";
import { providerFetch, sortInstitutions, utcDay, type BankSettings } from "./BankSettings.ts";

const API = "https://bankaccountdata.gocardless.com/api/v2";
const PKO_INSTITUTION_ID = "PKO_BPKOPLPW";
const SANDBOX_INSTITUTION_ID = "SANDBOXFINANCE_SFIN0000";
const TOKEN = "gocardless_token";
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

type TokenPayload = { access: string; refresh: string; obtainedAt: number };

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

export class GoCardless {
  readonly #settings: BankSettings;
  readonly #runtime: Runtime;

  constructor(settings: BankSettings, runtime: Runtime) {
    this.#settings = settings;
    this.#runtime = runtime;
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
    const rows = (await this.#fetch("/institutions/?country=pl", {}, await this.#token())) as { id: string; name: string; logo?: string }[];
    return sortInstitutions(rows.map((row) => ({ id: row.id, name: row.name, logo: row.logo || "" })));
  }

  async start(options: { redirect: string; sandbox: boolean; institutionId?: string; institutionName?: string }): Promise<{ link: string }> {
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
    return { link: requisition.link };
  }

  async fetchTransactions(): Promise<BankFetch> {
    const requisitionId = this.#settings.get("gocardless_requisition_id");
    if (!requisitionId) throw new Error("Brak połączenia z bankiem. Najpierw zaloguj się w banku przez GoCardless.");
    const token = await this.#token();
    const requisition = (await this.#fetch(`/requisitions/${requisitionId}/`, {}, token)) as { accounts?: string[]; status?: string };
    if (!requisition.accounts?.length) {
      throw new Error(
        requisition.status === "LN"
          ? "Połączenie w toku. Dokończ logowanie w oknie banku."
          : "Bank nie zwrócił żadnego konta. Spróbuj połączyć się ponownie.",
      );
    }
    const bank = this.#settings.get("gocardless_institution_name") || "PKO BP";
    const accounts: BankFetch["accounts"] = [];
    for (const accountId of requisition.accounts) {
      const details = (await this.#fetch(`/accounts/${accountId}/details/`, {}, token)) as { account?: { iban?: string; name?: string } };
      const payload = (await this.#fetch(`/accounts/${accountId}/transactions/`, {}, token)) as {
        transactions?: { booked?: GcTransaction[] };
      };
      accounts.push({
        externalId: accountId,
        bank,
        iban: details.account?.iban || "",
        label: details.account?.name || "",
        transactions: (payload.transactions?.booked || []).map(GoCardless.#map),
      });
    }
    return { accounts };
  }

  #secrets() {
    return {
      secretId: this.#settings.get("gocardless_secret_id") || this.#runtime.env("GOCARDLESS_SECRET_ID"),
      secretKey: this.#settings.get("gocardless_secret_key") || this.#runtime.env("GOCARDLESS_SECRET_KEY"),
    };
  }

  #fetch(path: string, init: RequestInit = {}, token?: string): Promise<unknown> {
    const headers = { ...(init.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return providerFetch("GoCardless", (body) => (body && "detail" in body ? String(body.detail) : ""), `${API}${path}`, {
      ...init,
      headers,
    });
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
          const refreshed = (await this.#fetch("/token/refresh/", { method: "POST", body: JSON.stringify({ refresh: cached.refresh }) })) as TokenPayload;
          return this.#saveToken(refreshed.access, refreshed.refresh || cached.refresh);
        }
      } catch {
        // fetch a fresh token
      }
    }
    const { secretId, secretKey } = this.#secrets();
    if (!secretId || !secretKey) throw new Error("Brak kluczy GoCardless. Wklej Secret ID i Secret Key w ustawieniach banku.");
    const token = (await this.#fetch("/token/new/", {
      method: "POST",
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    })) as TokenPayload;
    return this.#saveToken(token.access, token.refresh);
  }

  static #map(raw: GcTransaction): BankTransaction {
    const amount = Number(raw.transactionAmount?.amount || 0);
    const payee = raw.creditorName || raw.debtorName || "";
    const title = raw.remittanceInformationUnstructured || "";
    const bookingDate = raw.bookingDate || raw.valueDate || utcDay();
    const external = raw.transactionId || raw.internalTransactionId || hashId([bookingDate, amount, payee, title]);
    return {
      id: hashId(["gc", external]),
      date: raw.valueDate || bookingDate,
      bookingDate,
      amount,
      currency: raw.transactionAmount?.currency || "PLN",
      type: "Open Banking",
      payee,
      title,
      description: [raw.additionalInformation, raw.remittanceInformationUnstructured].filter(Boolean).join("\n"),
      externalId: `gc:${external}`,
    };
  }
}
