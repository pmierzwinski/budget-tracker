// Open Banking through Enable Banking (free private mode for your own accounts).
import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Institution, Transaction } from "../../../shared/types.ts";
import { getJsonSetting, getSetting, linkedAccounts, setJsonSetting, setSetting, upsertLinkedAccount, userCategorizer } from "../../db/index.ts";
import { apiUrl, publicUrl, serverEnv } from "../../runtime.ts";
import type { Categorizer } from "../categories/categorizer.ts";
import { hashId, newTransaction, utcDay } from "../transactions/model.ts";
import { providerFetch, sortInstitutions } from "./http.ts";

const API = "https://api.enablebanking.com";
const SESSIONS = "enablebanking_sessions";
const PENDING = "enablebanking_state";
const RETURN_TO = "enablebanking_return";

/** The URL the user registers as "Redirect URL" in the Enable Banking panel. */
export const enableBankingRedirect = `${apiUrl}/api/bank/enablebanking/callback`;

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

function hasKeys(): boolean {
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

/** JWT RS256 signed with the application key (`kid` = Application ID). */
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

function ebFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  return providerFetch(
    "Enable Banking",
    `${API}${path}`,
    { ...init, headers: { authorization: `Bearer ${token()}`, ...(init.headers as Record<string, string>) } },
    (body) => body?.message || body?.error || (body?.detail ? JSON.stringify(body.detail) : ""),
  );
}

export async function listAspsps(): Promise<Institution[]> {
  const data = (await ebFetch("/aspsps?country=PL&psu_type=personal")) as {
    aspsps?: { name: string; country: string; logo?: string }[];
  };
  return sortInstitutions((data.aspsps || []).map((item) => ({ id: item.name, name: item.name, logo: item.logo || "" })));
}

function sessions(): Session[] {
  return getJsonSetting<Session[]>(SESSIONS, []);
}

/** Starts bank login; after the callback the user returns to `returnTo` (the frontend that clicked "Połącz"). */
export async function startEnableBanking(options: { aspsp: string; returnTo: string }): Promise<{ link: string }> {
  setSetting(RETURN_TO, options.returnTo);
  if (!options.aspsp) throw new Error("Wybierz bank.");
  const validUntil = new Date(Date.now() + 89 * 24 * 60 * 60 * 1000).toISOString();
  const state = randomUUID();
  setJsonSetting(PENDING, { state, aspsp: options.aspsp });
  const data = (await ebFetch("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: options.aspsp, country: "PL" },
      state,
      redirect_url: enableBankingRedirect,
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

async function finishEnableBanking(code: string, state: string): Promise<{ accounts: number }> {
  const pending = getJsonSetting<{ state?: string; aspsp?: string }>(PENDING, {});
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
    upsertLinkedAccount("enablebanking", account.uid, { bank: aspsp, iban, label: account.name || account.product });
    uids.push(account.uid);
  }
  const next = sessions().filter((row) => row.aspsp !== aspsp);
  next.push({ id: data.session_id, aspsp, validUntil: data.access?.valid_until || "", accounts: uids });
  setJsonSetting(SESSIONS, next);
  setSetting(PENDING, "");
  return { accounts: uids.length };
}

/** Handles the bank's redirect; returns where to send the browser (with ?bank=connected or ?bank=error). */
export async function enableBankingCallback(query: Record<string, unknown>): Promise<string> {
  const back = getSetting(RETURN_TO) || publicUrl;
  const failed = (message: string) => `${back}/?bank=error&message=${encodeURIComponent(message)}`;
  const error = typeof query.error === "string" ? query.error : "";
  if (error) return failed(String(query.error_description || error));
  try {
    await finishEnableBanking(String(query.code || ""), String(query.state || ""));
    return `${back}/?bank=connected&provider=enablebanking`;
  } catch (err) {
    return failed(err instanceof Error ? err.message : "Nie udało się dokończyć połączenia");
  }
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

/** Only booked, non-zero entries. */
function mapTx(raw: EbTransaction, accountId: string, iban: string, categorize: Categorizer): Transaction | null {
  if (raw.status && raw.status !== "BOOK") return null;
  const value = Math.abs(Number(raw.transaction_amount?.amount || 0));
  if (!value) return null;
  const amount = raw.credit_debit_indicator === "DBIT" ? -value : value;
  const payee = (amount < 0 ? raw.creditor?.name : raw.debtor?.name) || raw.creditor?.name || raw.debtor?.name || "";
  const title = (raw.remittance_information || []).join(" ").replace(/\s+/g, " ").trim();
  const bookingDate = raw.transaction_date || raw.booking_date || raw.value_date || utcDay();
  const type = raw.bank_transaction_code?.description || "Open Banking";
  const external = raw.entry_reference || raw.transaction_id || hashId([accountId, bookingDate, amount, payee, title]);
  const draft = { payee, title, description: title, type, amount };
  return newTransaction({
    ...draft,
    id: hashId(["eb", external]),
    date: raw.value_date || raw.booking_date || bookingDate,
    bookingDate,
    currency: raw.transaction_amount?.currency,
    accountIban: iban,
    accountId,
    category: categorize(draft),
    source: "enablebanking",
    externalId: `eb:${external}`,
  });
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

/** New accounts fetch up to 2 years back (the bank may allow only 90 days), known ones the last 60 days. */
export async function syncEnableBanking(): Promise<{ imported: Transaction[]; accounts: number }> {
  const linked = linkedAccounts("enablebanking");
  if (!linked.length) throw new Error("Brak połączonych kont. Najpierw połącz bank przez Enable Banking.");
  const categorize = userCategorizer();
  const imported: Transaction[] = [];
  for (const account of linked) {
    let raw: EbTransaction[];
    try {
      raw = await fetchTransactions(account.externalId, utcDay(-(account.count ? 60 : 730)));
    } catch {
      raw = await fetchTransactions(account.externalId, utcDay(-89));
    }
    for (const item of raw) {
      const tx = mapTx(item, account.id, account.iban, categorize);
      if (tx) imported.push(tx);
    }
  }
  return { imported, accounts: linked.length };
}

export function enableBankingStatus() {
  return {
    hasKeys: hasKeys(),
    appId: config().appId,
    sessions: sessions().map((row) => ({ aspsp: row.aspsp, validUntil: row.validUntil, accounts: row.accounts.length })),
    redirectUrl: enableBankingRedirect,
  };
}
