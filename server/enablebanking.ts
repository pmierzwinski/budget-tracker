import { createHash, createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { categorizeWithUserRules, searchText } from "./categorize.ts";
import { createAccount, findAccount, getSetting, hiddenCategoryNames, linkAccount, linkedAccounts, listRules, setSetting } from "./db.ts";
import { serverEnv } from "./runtime.ts";
import type { Transaction } from "./types.ts";

const API = "https://api.enablebanking.com";

type Session = { id: string; aspsp: string; validUntil: string; accounts: string[] };

function config() {
  const appId = getSetting("enablebanking_app_id") || serverEnv("ENABLEBANKING_APP_ID");
  let key = getSetting("enablebanking_private_key");
  const keyPath = serverEnv("ENABLEBANKING_KEY_PATH");
  if (!key && keyPath) {
    try {
      key = readFileSync(keyPath, "utf8");
    } catch {
      key = "";
    }
  }
  return { appId, key };
}

export function hasEnableBankingKeys(): boolean {
  const { appId, key } = config();
  return Boolean(appId && key);
}

export function saveEnableBankingKeys(appId: string, privateKey: string): void {
  const id = appId.trim();
  const key = privateKey.trim();
  if (!id) throw new Error("Podaj Application ID z panelu Enable Banking.");
  if (key && !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error("Klucz prywatny musi być w formacie PEM (-----BEGIN PRIVATE KEY-----).");
  }
  if (!key && !config().key) throw new Error("Wklej klucz prywatny (plik .pem) wygenerowany przy rejestracji aplikacji.");
  setSetting("enablebanking_app_id", id);
  if (key) setSetting("enablebanking_private_key", key);
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function token(): string {
  const { appId, key } = config();
  if (!appId || !key) throw new Error("Brak kluczy Enable Banking. Wklej Application ID i klucz prywatny w Ustawieniach → Bank.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const payload = base64url(
    JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  let signature: Buffer;
  try {
    signature = signer.sign(key);
  } catch {
    throw new Error("Nie da się podpisać żądania tym kluczem. Sprawdź, czy wkleiłeś cały plik .pem.");
  }
  return `${header}.${payload}.${base64url(signature)}`;
}

async function ebFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const body = data as { message?: string; detail?: unknown; error?: string } | null;
    const detail = body?.message || body?.error || (body?.detail ? JSON.stringify(body.detail) : text.slice(0, 300));
    throw new Error(`Enable Banking ${response.status}: ${detail}`);
  }
  return data;
}

export async function listAspsps(): Promise<{ id: string; name: string; logo: string }[]> {
  const data = (await ebFetch("/aspsps?country=PL&psu_type=personal")) as {
    aspsps?: { name: string; country: string; logo?: string }[];
  };
  return (data.aspsps || [])
    .map((item) => ({ id: item.name, name: item.name, logo: item.logo || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

function sessions(): Session[] {
  try {
    return JSON.parse(getSetting("enablebanking_sessions") || "[]") as Session[];
  } catch {
    return [];
  }
}

export async function startEnableBanking(options: { aspsp: string; redirect: string }): Promise<{ link: string }> {
  if (!options.aspsp) throw new Error("Wybierz bank.");
  const validUntil = new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString();
  const state = randomUUID();
  setSetting("enablebanking_state", JSON.stringify({ state, aspsp: options.aspsp }));
  const data = (await ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: options.aspsp, country: "PL" },
      state,
      redirect_url: options.redirect,
      psu_type: "personal",
      language: "pl",
    }),
  })) as { url: string };
  return { link: data.url };
}

type EbAccount = {
  uid: string;
  account_id?: { iban?: string; other?: { identification?: string } };
  name?: string;
  product?: string;
  currency?: string;
};

export async function finishEnableBanking(code: string, state: string): Promise<{ accounts: number }> {
  const pending = JSON.parse(getSetting("enablebanking_state") || "{}") as { state?: string; aspsp?: string };
  if (!code) throw new Error("Bank nie zwrócił kodu autoryzacji.");
  if (pending.state && state && pending.state !== state) throw new Error("Niepoprawny parametr state — spróbuj połączyć się jeszcze raz.");
  const data = (await ebFetch("/sessions", { method: "POST", body: JSON.stringify({ code }) })) as {
    session_id: string;
    accounts?: EbAccount[];
    aspsp?: { name?: string };
    access?: { valid_until?: string };
  };
  const aspsp = data.aspsp?.name || pending.aspsp || "Bank";
  const uids: string[] = [];
  for (const account of data.accounts || []) {
    const iban = account.account_id?.iban || account.account_id?.other?.identification || "";
    const existing = findAccount({ provider: "enablebanking", externalId: account.uid, iban });
    const local =
      existing ||
      createAccount({
        name: `${aspsp}${account.name || account.product ? ` · ${account.name || account.product}` : ""}${iban ? ` ··${iban.slice(-4)}` : ""}`,
        bank: aspsp,
        iban,
      });
    linkAccount(local.id, { provider: "enablebanking", externalId: account.uid, iban });
    uids.push(account.uid);
  }
  const next = sessions().filter((row) => row.aspsp !== aspsp);
  next.push({ id: data.session_id, aspsp, validUntil: data.access?.valid_until || "", accounts: uids });
  setSetting("enablebanking_sessions", JSON.stringify(next));
  setSetting("enablebanking_state", "");
  return { accounts: uids.length };
}

type EbTransaction = {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount?: { amount?: string; currency?: string };
  credit_debit_indicator?: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
  bank_transaction_code?: { description?: string };
};

function mapTx(raw: EbTransaction, accountId: string, iban: string): Transaction | null {
  if (raw.status && raw.status !== "BOOK") return null;
  const value = Math.abs(Number(raw.transaction_amount?.amount || 0));
  if (!value) return null;
  const amount = raw.credit_debit_indicator === "DBIT" ? -value : value;
  const payee = (amount < 0 ? raw.creditor?.name : raw.debtor?.name) || raw.creditor?.name || raw.debtor?.name || "";
  const title = (raw.remittance_information || []).join(" ").replace(/\s+/g, " ").trim();
  const bookingDate = raw.transaction_date || raw.booking_date || raw.value_date || new Date().toISOString().slice(0, 10);
  const date = raw.value_date || raw.booking_date || bookingDate;
  const type = raw.bank_transaction_code?.description || "Open Banking";
  const external =
    raw.entry_reference ||
    raw.transaction_id ||
    createHash("sha256").update(`${accountId}|${bookingDate}|${amount}|${payee}|${title}`).digest("hex").slice(0, 24);
  const draft = { payee, title, description: title, type };
  return {
    id: createHash("sha256").update(`eb|${external}`).digest("hex").slice(0, 24),
    date,
    bookingDate,
    amount,
    currency: raw.transaction_amount?.currency || "PLN",
    type,
    payee,
    title,
    description: title,
    accountIban: iban,
    accountId,
    category: categorizeWithUserRules(searchText(draft), amount, listRules(), hiddenCategoryNames()),
    comment: "",
    excluded: false,
    source: "enablebanking",
    externalId: `eb:${external}`,
    createdAt: new Date().toISOString(),
  };
}

async function fetchTransactions(uid: string, dateFrom: string): Promise<EbTransaction[]> {
  const items: EbTransaction[] = [];
  let continuation = "";
  for (let page = 0; page < 50; page += 1) {
    const query = new URLSearchParams({ date_from: dateFrom });
    if (continuation) query.set("continuation_key", continuation);
    const data = (await ebFetch(`/accounts/${uid}/transactions?${query}`)) as {
      transactions?: EbTransaction[];
      continuation_key?: string;
    };
    items.push(...(data.transactions || []));
    if (!data.continuation_key) break;
    continuation = data.continuation_key;
  }
  return items;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function syncEnableBanking(): Promise<{ imported: Transaction[]; accounts: number }> {
  const linked = linkedAccounts("enablebanking");
  if (!linked.length) throw new Error("Brak połączonych kont. Najpierw połącz bank przez Enable Banking.");
  const imported: Transaction[] = [];
  for (const account of linked) {
    let raw: EbTransaction[];
    try {
      raw = await fetchTransactions(account.externalId, daysAgo(account.count ? 60 : 730));
    } catch {
      raw = await fetchTransactions(account.externalId, daysAgo(89));
    }
    for (const item of raw) {
      const tx = mapTx(item, account.id, account.iban);
      if (tx) imported.push(tx);
    }
  }
  return { imported, accounts: linked.length };
}

export function enableBankingStatus() {
  const { appId } = config();
  return {
    hasKeys: hasEnableBankingKeys(),
    appId,
    sessions: sessions().map((row) => ({ aspsp: row.aspsp, validUntil: row.validUntil, accounts: row.accounts.length })),
  };
}
