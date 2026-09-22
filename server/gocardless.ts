import { createHash, randomUUID } from "node:crypto";
import { categorizeWithUserRules, searchText } from "./categorize.ts";
import { getSetting, hiddenCategoryNames, listRules, saveBankAccount, setSetting } from "./db.ts";
import type { Transaction } from "./types.ts";

const API = "https://bankaccountdata.gocardless.com/api/v2";
export const PKO_INSTITUTION_ID = "PKO_BPKOPLPW";
export const SANDBOX_INSTITUTION_ID = "SANDBOXFINANCE_SFIN0000";

type TokenPayload = {
  access: string;
  refresh: string;
  access_expires?: number;
  obtainedAt: number;
};

function secrets() {
  const secretId = getSetting("gocardless_secret_id") || process.env.GOCARDLESS_SECRET_ID || "";
  const secretKey = getSetting("gocardless_secret_key") || process.env.GOCARDLESS_SECRET_KEY || "";
  return { secretId, secretKey };
}

export function hasSecrets(): boolean {
  const { secretId, secretKey } = secrets();
  return Boolean(secretId && secretKey);
}

async function gcFetch(path: string, init: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail =
      typeof data === "object" && data && "detail" in data
        ? String((data as { detail: string }).detail)
        : text.slice(0, 300);
    throw new Error(`GoCardless ${response.status}: ${detail}`);
  }
  return data;
}

async function getToken(): Promise<string> {
  const cachedRaw = getSetting("gocardless_token");
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as TokenPayload;
      const age = Date.now() - cached.obtainedAt;
      if (cached.access && age < 20 * 60 * 60 * 1000) return cached.access;
      if (cached.refresh) {
        const refreshed = (await gcFetch("/token/refresh/", {
          method: "POST",
          body: JSON.stringify({ refresh: cached.refresh }),
        })) as TokenPayload;
        const payload: TokenPayload = {
          access: refreshed.access,
          refresh: refreshed.refresh || cached.refresh,
          obtainedAt: Date.now(),
        };
        setSetting("gocardless_token", JSON.stringify(payload));
        return payload.access;
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
  setSetting(
    "gocardless_token",
    JSON.stringify({
      access: token.access,
      refresh: token.refresh,
      obtainedAt: Date.now(),
    }),
  );
  return token.access;
}

export async function startConnection(options: {
  redirect: string;
  sandbox: boolean;
}): Promise<{ link: string; requisitionId: string }> {
  const token = await getToken();
  const institutionId = options.sandbox ? SANDBOX_INSTITUTION_ID : PKO_INSTITUTION_ID;
  const agreement = (await gcFetch(
    "/agreements/enduser/",
    {
      method: "POST",
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: options.sandbox ? 90 : 90,
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

function mapGcTx(raw: GcTransaction, iban: string): Transaction {
  const amount = Number(raw.transactionAmount?.amount || 0);
  const payee = raw.creditorName || raw.debtorName || "";
  const title = raw.remittanceInformationUnstructured || "";
  const description = [raw.additionalInformation, raw.remittanceInformationUnstructured]
    .filter(Boolean)
    .join("\n");
  const bookingDate = raw.bookingDate || raw.valueDate || new Date().toISOString().slice(0, 10);
  const date = raw.valueDate || bookingDate;
  const external =
    raw.transactionId ||
    raw.internalTransactionId ||
    createHash("sha256").update(`${bookingDate}|${amount}|${payee}|${title}`).digest("hex").slice(0, 24);
  const draft = { payee, title, description, type: "Open Banking" };
  return {
    id: createHash("sha256").update(`gc|${external}`).digest("hex").slice(0, 24),
    date,
    bookingDate,
    amount,
    currency: raw.transactionAmount?.currency || "PLN",
    type: "Open Banking",
    payee,
    title,
    description,
    accountIban: iban,
    category: categorizeWithUserRules(searchText(draft), amount, listRules(), hiddenCategoryNames()),
    comment: "",
    source: "gocardless",
    externalId: `gc:${external}`,
    createdAt: new Date().toISOString(),
  };
}

export async function syncAccounts(): Promise<{ imported: Transaction[]; accounts: number }> {
  const requisitionId = getSetting("gocardless_requisition_id");
  if (!requisitionId) throw new Error("Brak połączenia z bankiem. Najpierw zaloguj się przez PKO.");
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

  const imported: Transaction[] = [];
  for (const accountId of requisition.accounts) {
    const details = (await gcFetch(`/accounts/${accountId}/details/`, {}, token)) as {
      account?: { iban?: string; name?: string; currency?: string; ownerName?: string };
    };
    const iban = details.account?.iban || "";
    saveBankAccount({
      id: accountId,
      iban,
      name: details.account?.name || details.account?.ownerName || "Konto PKO",
      currency: details.account?.currency || "PLN",
      gocardlessAccountId: accountId,
      requisitionId,
    });
    const payload = (await gcFetch(`/accounts/${accountId}/transactions/`, {}, token)) as {
      transactions?: { booked?: GcTransaction[]; pending?: GcTransaction[] };
    };
    const booked = payload.transactions?.booked || [];
    imported.push(...booked.map((item) => mapGcTx(item, iban)));
  }
  return { imported, accounts: requisition.accounts.length };
}

export function connectionStatus() {
  return {
    hasSecrets: hasSecrets(),
    requisitionId: getSetting("gocardless_requisition_id") || null,
    institutionId: getSetting("gocardless_institution_id") || null,
  };
}
