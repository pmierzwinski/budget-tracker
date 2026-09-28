// Open Banking through GoCardless Bank Account Data (new sign-ups are closed; kept for existing users).
import { randomUUID } from "node:crypto";
import type { Institution, Transaction } from "../../shared/types.ts";
import { getJsonSetting, getSetting, setJsonSetting, setSetting, upsertLinkedAccount, userCategorizer } from "../db/index.ts";
import { serverEnv } from "../runtime.ts";
import { hashId, newTransaction, utcDay } from "../transaction.ts";
import type { Categorizer } from "../categorize.ts";
import { providerFetch, sortInstitutions } from "./http.ts";

const API = "https://bankaccountdata.gocardless.com/api/v2";
const PKO_INSTITUTION_ID = "PKO_BPKOPLPW";
const SANDBOX_INSTITUTION_ID = "SANDBOXFINANCE_SFIN0000";
const TOKEN = "gocardless_token";
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000;

type TokenPayload = { access: string; refresh: string; access_expires?: number; obtainedAt: number };

function secrets() {
  const secretId = getSetting("gocardless_secret_id") || serverEnv("GOCARDLESS_SECRET_ID");
  const secretKey = getSetting("gocardless_secret_key") || serverEnv("GOCARDLESS_SECRET_KEY");
  return { secretId, secretKey };
}

export function saveGoCardlessSecrets(secretId: string, secretKey: string): void {
  const id = secretId.trim();
  const key = secretKey.trim();
  if (!id || !key) throw new Error("Podaj Secret ID i Secret Key z portalu GoCardless.");
  setSetting("gocardless_secret_id", id);
  setSetting("gocardless_secret_key", key);
  setSetting(TOKEN, "");
}

function gcFetch(path: string, init: RequestInit = {}, token?: string): Promise<unknown> {
  const headers = { ...(init.headers as Record<string, string>), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return providerFetch("GoCardless", `${API}${path}`, { ...init, headers }, (body) =>
    body && "detail" in body ? String(body.detail) : "",
  );
}

function saveToken(access: string, refresh: string): string {
  setJsonSetting(TOKEN, { access, refresh, obtainedAt: Date.now() } satisfies TokenPayload);
  return access;
}

async function getToken(): Promise<string> {
  const cached = getJsonSetting<TokenPayload | null>(TOKEN, null);
  if (cached) {
    try {
      if (cached.access && Date.now() - cached.obtainedAt < TOKEN_TTL_MS) return cached.access;
      if (cached.refresh) {
        const refreshed = (await gcFetch("/token/refresh/", {
          method: "POST",
          body: JSON.stringify({ refresh: cached.refresh }),
        })) as TokenPayload;
        return saveToken(refreshed.access, refreshed.refresh || cached.refresh);
      }
    } catch {
      // fetch a fresh token
    }
  }

  const { secretId, secretKey } = secrets();
  if (!secretId || !secretKey) {
    throw new Error("Brak kluczy GoCardless. Wklej Secret ID i Secret Key w ustawieniach banku.");
  }
  const token = (await gcFetch("/token/new/", {
    method: "POST",
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  })) as TokenPayload;
  return saveToken(token.access, token.refresh);
}

export async function listInstitutions(): Promise<Institution[]> {
  const token = await getToken();
  const rows = (await gcFetch("/institutions/?country=pl", {}, token)) as { id: string; name: string; logo?: string }[];
  return sortInstitutions(rows.map((row) => ({ id: row.id, name: row.name, logo: row.logo || "" })));
}

export async function startConnection(options: {
  redirect: string;
  sandbox: boolean;
  institutionId?: string;
  institutionName?: string;
}): Promise<{ link: string; requisitionId: string }> {
  const token = await getToken();
  const institutionId = options.sandbox ? SANDBOX_INSTITUTION_ID : options.institutionId || PKO_INSTITUTION_ID;
  setSetting("gocardless_institution_name", options.sandbox ? "Sandbox" : options.institutionName || "PKO BP");
  const agreement = (await gcFetch(
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

  const requisition = (await gcFetch(
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

  setSetting("gocardless_requisition_id", requisition.id);
  setSetting("gocardless_institution_id", institutionId);
  return { link: requisition.link, requisitionId: requisition.id };
}

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

function mapGcTx(raw: GcTransaction, iban: string, accountId: string, categorize: Categorizer): Transaction {
  const amount = Number(raw.transactionAmount?.amount || 0);
  const payee = raw.creditorName || raw.debtorName || "";
  const title = raw.remittanceInformationUnstructured || "";
  const description = [raw.additionalInformation, raw.remittanceInformationUnstructured].filter(Boolean).join("\n");
  const bookingDate = raw.bookingDate || raw.valueDate || utcDay();
  const external = raw.transactionId || raw.internalTransactionId || hashId([bookingDate, amount, payee, title]);
  const draft = { payee, title, description, type: "Open Banking", amount };
  return newTransaction({
    ...draft,
    id: hashId(["gc", external]),
    date: raw.valueDate || bookingDate,
    bookingDate,
    currency: raw.transactionAmount?.currency,
    accountIban: iban,
    accountId,
    category: categorize(draft),
    source: "gocardless",
    externalId: `gc:${external}`,
  });
}

export async function syncAccounts(): Promise<{ imported: Transaction[]; accounts: number }> {
  const requisitionId = getSetting("gocardless_requisition_id");
  if (!requisitionId) throw new Error("Brak połączenia z bankiem. Najpierw zaloguj się w banku przez GoCardless.");
  const token = await getToken();
  const requisition = (await gcFetch(`/requisitions/${requisitionId}/`, {}, token)) as {
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

  const categorize = userCategorizer();
  const bank = getSetting("gocardless_institution_name") || "PKO BP";
  const imported: Transaction[] = [];
  for (const accountId of requisition.accounts) {
    const details = (await gcFetch(`/accounts/${accountId}/details/`, {}, token)) as {
      account?: { iban?: string; name?: string; currency?: string; ownerName?: string };
    };
    const iban = details.account?.iban || "";
    const local = upsertLinkedAccount("gocardless", accountId, { bank, iban, label: details.account?.name });
    const payload = (await gcFetch(`/accounts/${accountId}/transactions/`, {}, token)) as {
      transactions?: { booked?: GcTransaction[]; pending?: GcTransaction[] };
    };
    const booked = payload.transactions?.booked || [];
    imported.push(...booked.map((item) => mapGcTx(item, iban, local.id, categorize)));
  }
  return { imported, accounts: requisition.accounts.length };
}

export function connectionStatus() {
  const { secretId, secretKey } = secrets();
  return {
    hasSecrets: Boolean(secretId && secretKey),
    requisitionId: getSetting("gocardless_requisition_id") || null,
    institutionId: getSetting("gocardless_institution_id") || null,
    institutionName: getSetting("gocardless_institution_name") || null,
  };
}
