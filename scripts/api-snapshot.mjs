// Regression safety net: runs the API on a scratch copy of the database, records GET responses and a fixed
// sequence of mutations, and compares them with an earlier run.
//   node scripts/api-snapshot.mjs --out <dir> [--db data/wydatki.db] [--compare <baseline dir>]
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, list) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), list[index + 1]]);
    return pairs;
  }, []),
);
const out = resolve(args.out || join(tmpdir(), "wydatki-snapshot"));
const sourceDb = resolve(args.db || join(root, "data", "wydatki.db"));
const port = Number(args.port || 8799);
const base = `http://127.0.0.1:${port}/api`;

const scratch = mkdtempSync(join(tmpdir(), "wydatki-root-"));
mkdirSync(join(scratch, "data"));
copyFileSync(sourceDb, join(scratch, "data", "wydatki.db"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, [join(root, "src", "modules", "app", "main.ts")], {
  env: { ...process.env, PORT: String(port), WYDATKI_ROOT: scratch, WYDATKI_NO_BROWSER: "1", HOSTED: "" },
  stdio: ["ignore", "ignore", "pipe"],
});
let serverErrors = "";
server.stderr.on("data", (chunk) => (serverErrors += chunk));

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
const HASH_ID = /\b[0-9a-f]{24}\b/g;
const uuidNames = new Map();
const hashNames = new Map();

// Demo ids hash the (random) account id, so they are renamed by first appearance. CSV ids stay raw:
// they must never change, otherwise re-importing a statement duplicates history.
function normalize(value, rawIds) {
  let text = JSON.stringify(value, null, 2)
    .replace(UUID, (id) => {
      if (!uuidNames.has(id)) uuidNames.set(id, `<uuid-${uuidNames.size + 1}>`);
      return uuidNames.get(id);
    })
    .replace(ISO_TIME, "<time>");
  if (!rawIds) {
    text = text.replace(HASH_ID, (id) => {
      if (!hashNames.has(id)) hashNames.set(id, `<id-${hashNames.size + 1}>`);
      return hashNames.get(id);
    });
  }
  return text;
}

let step = 0;
let demoSeen = false;
function record(name, value) {
  step += 1;
  if (name === "demo") demoSeen = true;
  const rawIds = !demoSeen || name.startsWith("csv");
  writeFileSync(join(out, `${String(step).padStart(3, "0")}-${name}.json`), normalize(value, rawIds) + "\n");
  return value;
}

async function call(method, path, body) {
  const init = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(base + path, init);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: response.status, data };
}

async function get(name, path) {
  return record(name, await call("GET", path)).data;
}

async function send(name, method, path, body) {
  return record(name, await call(method, path, body)).data;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Serwer nie wstał:\n${serverErrors}`);
}

async function readAll(account) {
  const suffix = account ? `&account=${account}` : "";
  const tag = account ? "acc" : "all";
  const meta = await get(`${tag}-meta`, `/meta?x=1${suffix}`);
  const cats = (meta.categories || []).slice(0, 2);
  const range = meta.minDate ? `from=${meta.minDate}&to=${meta.maxDate}` : "";
  const month = meta.maxDate ? `from=${meta.maxDate.slice(0, 7)}-01&to=${meta.maxDate}` : "";
  const filters = [
    ["plain", ""],
    ["range", range],
    ["month", month],
    ["cats", `category=${encodeURIComponent(cats.join(","))}`],
    ["expense", `kind=expense&${month}`],
    ["income", `kind=income`],
    ["weekday", `weekday=5&${range}`],
    ["amount", `minAmount=100&maxAmount=199,99`],
    ["hidden", `includeExcluded=1&${month}`],
    ["hidden-only", `excludedOnly=1`],
    ["search", `q=a&sort=amount_asc`],
    ["sort", `sort=category_desc&${month}`],
  ];
  for (const [name, query] of filters) {
    await get(`${tag}-tx-${name}`, `/transactions?${query}${suffix}`);
    await get(`${tag}-stats-${name}`, `/stats?${query}${suffix}`);
    await get(`${tag}-insights-${name}`, `/insights?${query}${suffix}`);
  }
  return meta;
}

async function run() {
  await waitForServer();
  const meta = await readAll();
  for (const account of meta.accounts || []) await readAll(account.id);
  await get("rules", "/rules");
  await get("accounts", "/accounts");
  await get("buckets", "/settings/amount-buckets");
  await get("bank-status", "/bank/status");
  await get("evaluations", "/ai/evaluations");

  const csv = readFileSync(join(root, "src", "modules", "importer", "fixtures", "pko-sample.csv"));
  const importCsv = (name, extra = {}) => {
    const form = new FormData();
    form.append("file", new Blob([csv]), "pko.csv");
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    return send(name, "POST", "/import", form);
  };
  const first = await importCsv("import-new", { account: "new", accountName: "Snapshot CSV" });
  await importCsv("import-again", { account: first.account?.id || "auto" });
  await importCsv("import-auto", { account: "auto" });
  await importCsv("import-bank", { account: "new", bank: "pko" });
  const csvAccount = first.account?.id;
  await get("csv-tx", `/transactions?account=${csvAccount}&sort=date_asc`);

  await send("demo", "POST", "/import/demo", {});
  await send("demo-raw", "POST", "/import/demo", { uncategorized: true });
  const accounts = (await get("accounts-after-demo", "/accounts")).accounts;
  const demo = accounts.find((row) => row.name === "Konto testowe");
  const demoTx = (await get("demo-tx", `/transactions?account=${demo.id}&sort=date_asc`)).items;
  await get("demo-stats", `/stats?account=${demo.id}`);
  await get("demo-insights", `/insights?account=${demo.id}`);

  const target = demoTx.find((tx) => tx.amount < 0 && tx.payee);
  await send("tx-comment", "PATCH", `/transactions/${target.id}`, { comment: "snapshot" });
  await send("tx-exclude", "PATCH", `/transactions/${target.id}`, { excluded: true });
  await send("tx-include", "PATCH", `/transactions/${target.id}`, { excluded: false });
  await send("tx-category-only", "PATCH", `/transactions/${target.id}`, { category: "Zdrowie", onlyThis: true });
  await send("tx-category-all", "PATCH", `/transactions/${target.id}`, { category: "Rozrywka", onlyThis: false });
  await send("tx-bad", "PATCH", `/transactions/${target.id}`, {});
  await get("demo-tx-after-category", `/transactions?account=${demo.id}&sort=date_asc`);

  await send("cat-add", "POST", "/categories", { name: "Snapshot kat" });
  await send("cat-add-dup", "POST", "/categories", { name: "Snapshot kat" });
  await send("limit-set", "PUT", "/category-limits", { category: "Snapshot kat", monthlyLimit: "150,5" });
  await send("limit-bad", "PUT", "/category-limits", { category: "Snapshot kat", monthlyLimit: "abc" });
  await send("limit-food", "PUT", "/category-limits", { category: "Jedzenie", monthlyLimit: 800 });
  await send("cat-rename", "PATCH", "/categories", { from: "Snapshot kat", to: "Snapshot kat 2" });
  await send("cat-rename-builtin", "PATCH", "/categories", { from: "Transport", to: "Dojazdy" });
  await send("cat-delete", "DELETE", `/categories?name=${encodeURIComponent("Snapshot kat 2")}`);
  await send("cat-delete-builtin", "DELETE", `/categories?name=${encodeURIComponent("Dojazdy")}`);
  await send("cat-delete-other", "DELETE", `/categories?name=Inne`);
  await get("demo-stats-after-cats", `/stats?account=${demo.id}`);

  const rule = await send("rule-add", "POST", "/rules", { pattern: "snapshotowa fraza", category: "Zdrowie" });
  await send("rule-bad", "POST", "/rules", { pattern: "", category: "" });
  const rules = (await get("rules-after", "/rules")).rules;
  const ruleId = rule?.id || rules.find((row) => row.pattern === "snapshotowa fraza")?.id;
  await send("rule-delete", "DELETE", `/rules/${ruleId}`);
  await get("demo-tx-after-rules", `/transactions?account=${demo.id}&sort=date_asc`);

  const insights = await get("demo-insights-before-recurring", `/insights?account=${demo.id}`);
  const recurring = insights.recurring?.[0];
  if (recurring) {
    await send("recurring-ended", "PUT", "/recurring", { key: recurring.key, status: "ended" });
    await send("recurring-bad", "PUT", "/recurring", { key: recurring.key, status: "wrong" });
    await get("demo-insights-after-recurring", `/insights?account=${demo.id}`);
  }

  await send("buckets-set", "PUT", "/settings/amount-buckets", { thresholds: [300, 50, 50, 1000] });
  await get("demo-stats-after-buckets", `/stats?account=${demo.id}`);

  await send("account-add", "POST", "/accounts", { name: "Snapshot konto", bank: "mbank", iban: "PL 61 1090 1014 0000 0712 1981 2874" });
  await send("account-rename", "PATCH", `/accounts/${demo.id}`, { name: "Konto testowe 2" });
  await send("account-delete", "DELETE", `/accounts/${csvAccount}`);
  await send("recategorize", "POST", "/recategorize");
  await get("meta-final", "/meta");
  await send("clear", "DELETE", "/data");
  await get("meta-cleared", "/meta");
}

function compare(baseline) {
  const left = readdirSync(baseline).sort();
  const right = readdirSync(out).sort();
  let failures = 0;
  for (const name of new Set([...left, ...right])) {
    const a = existsSync(join(baseline, name)) ? readFileSync(join(baseline, name), "utf8") : null;
    const b = existsSync(join(out, name)) ? readFileSync(join(out, name), "utf8") : null;
    if (a === b) continue;
    failures += 1;
    if (a == null || b == null) {
      console.log(`✗ ${name}: ${a == null ? "brak w baseline" : "brak w nowym"}`);
      continue;
    }
    const la = a.split("\n");
    const lb = b.split("\n");
    const line = la.findIndex((text, index) => text !== lb[index]);
    console.log(`✗ ${name} (linia ${line + 1}):\n  - ${la[line]}\n  + ${lb[line]}`);
  }
  console.log(failures ? `\n${failures} różnic` : `✓ identyczne (${right.length} plików)`);
  return failures;
}

let code = 0;
try {
  await run();
  console.log(`Zapisano ${step} odpowiedzi w ${out}`);
  if (args.compare) code = compare(resolve(args.compare)) ? 1 : 0;
} catch (error) {
  console.error(error);
  console.error(serverErrors);
  code = 1;
} finally {
  server.kill();
  await new Promise((done) => setTimeout(done, 300));
  rmSync(scratch, { recursive: true, force: true });
}
process.exit(code);
