# Refactor: feature modules + tests — current state

Status on 2026-10-04: **Stage 1 files are moved and imports are wired so the server starts.** Routes still live in `server/routes/` and re-export through `server/db/index.ts`. The earlier refactor is still uncommitted (the user's choice).

Moves already done (plain `mv`, contents unchanged):
| was | now |
|---|---|
| `server/fixtures/pko-przyklad.csv` | `server/fixtures/pko-sample.csv` (`scripts/api-snapshot.mjs:147` not updated yet) |
| `server/db/core.ts` | `server/platform/db.ts` |
| `server/routes/http.ts` | `server/platform/http.ts` |
| `server/db/schema.ts` | `server/schema.ts` |
| `server/db/settings.ts` | `server/modules/settings/store.ts` |
| `server/transaction.ts` | `server/modules/transactions/model.ts` |
| `server/db/transactions.ts` | `server/modules/transactions/repository.ts` |
| `server/categorize.ts` | `server/modules/categories/categorizer.ts` |
| `server/db/categories.ts`, `rules.ts`, `limits.ts` | `server/modules/categories/` |
| `server/db/accounts.ts` | `server/modules/accounts/accounts.ts` |
| `server/db/stats.ts`, `insights.ts` | `server/modules/statistics/` |
| `server/ai.ts`, `server/db/evaluations.ts` | `server/modules/ai/` |
| `server/csv/`, `server/demo.ts` | `server/modules/importer/csv/`, `server/modules/importer/demo.ts` |
| `server/banking/*` | `server/modules/banking/` |

Still in the old place, to be split up / deleted: `server/db/index.ts`, `server/db/rows.ts`, `server/routes/*.ts` (their content goes into `modules/*/routes.ts`).

Next steps: `index.ts` for each module, fix imports, move `applyCategory` → `categories/assign.ts`, write `routes.ts` for each module plus `meta`, update `app.ts`/`sessions.ts`, fix the snapshot fixture path, then typecheck + snapshot compare.

## Goal
- Server and front split into **feature modules** (statistics, importer, categories, …). Each module has one public API.
- **Views** (dashboard, statistics, payments, limits, import, settings) use only those APIs.
- Tests go through each module's public API (`node:test`, no new dependencies).
- File names in English; UI texts stay in Polish.

## Decisions made
- **Renaming:** developer files only. `server/fixtures/pko-przyklad.csv` → `pko-sample.csv`, and update `scripts/api-snapshot.mjs:147` and `AGENTS.md:183`. These stay as they are: the product name "Wydatki", `data/wydatki.db`, `Wydatki.exe`, `CZYTAJ.txt`, the cookie `wydatki_sid` and localStorage `wydatki.account`. Every other file name is already in English.
- **Stages:** 1) server → 2) front → 3) tests. After each stage: `npm run typecheck` + snapshot compare.
- **No commits** for now (the user chose this). Move files with plain `mv`, not `git mv`, so the git index stays untouched.
- **HTTP API unchanged** (paths and response shapes), so the snapshot must show no differences.
- **Snapshot baseline** was taken on 2026-09-29 (it's valid only on that day because of the demo account):
  `/tmp/claude-1000/-mnt-d-cosie-wydatki/67397056-eab7-463b-a8d4-c06c943786d5/scratchpad/base` (163 responses). On another day, take a new baseline **before** starting any changes.

## Stage 1 — server (next step)

### Layout
```
server/
  index.ts app.ts runtime.ts sessions.ts   runtime.ts stays here (appRoot = one level above it, runtime.ts:20)
  schema.ts                                former db/schema.ts; tables + migrations (use categories + transactions)
  platform/
    db.ts        former db/core.ts (Proxy db, transaction, changes, forAccount, openDatabase, withDatabase, registerSchema)
    http.ts      former routes/http.ts (route, text, typed, readAccount, readFilters)
  modules/
    settings/      store.ts (former db/settings.ts), routes.ts (/settings/amount-buckets), index.ts
    transactions/  model.ts (former transaction.ts + rowToTx), repository.ts (former db/transactions.ts without applyCategory,
                   clearTransactions, clearAll), routes.ts (GET/PATCH /transactions), index.ts
    categories/    categorizer.ts (former categorize.ts), categories.ts, rules.ts, limits.ts,
                   assign.ts (applyCategory from db/transactions.ts:147-163), routes.ts (/categories, /category-limits, /rules), index.ts
    accounts/      accounts.ts (+ rowToAccount), routes.ts (/accounts CRUD), index.ts
    statistics/    stats.ts, insights.ts, routes.ts (/stats, /insights, /recurring), index.ts
    ai/            ai.ts, evaluations.ts (+ rowToEvaluation), routes.ts (/ai/*), index.ts
    importer/      csv/ (unchanged inside), demo.ts, importFile.ts (logic from the POST /import route), data.ts (clearData),
                   routes.ts (/import, /import/demo, /recategorize, DELETE /data), index.ts
    banking/       provider.ts (BankProvider), enablebanking.ts, http.ts, routes.ts (/bank/*), index.ts
    meta/          routes.ts (GET /meta: composes the other modules)
```
`server/db/` and `server/routes/` go away completely. `db/rows.ts` is split between the modules.

### Boundary rules (refined after reading the code)
- `index.ts` = the module's **domain API**. It does **not** export routes.
- `routes.ts` = the module's **HTTP API**. Only `app.ts` imports it, and it may use the `index.ts` of any module. This removes the cycles caused by GET `/transactions` needing `listCategories` and PATCH needing `applyCategory`.
- Domain files import other modules only through `../<module>/index.ts`, following this order (no cycles):
  `platform → settings → transactions → categories → accounts → statistics → ai → importer, banking`.
  - `transactions` doesn't import `categories` once `applyCategory` has moved to `categories/assign.ts` (that was its only dependency: `ensureCategory` and `upsertRule`).
  - `categories` uses `rowToTx` / `getTransaction` from transactions.
  - Direct SQL on other tables (`moveCategory`, `recategorizeAll`, `deleteAccount`, `accountRows` JOIN) stays as it is: it couples through the tables, not through imports.
- `platform/` imports nothing from `modules/`.
- `schema.ts` is imported first in `app.ts`, and also in `sessions.ts` and the test helper. It replaces the side-effect import of the `db/index.ts` barrel. Update the error message in `platform/db.ts` ("importuj bazę przez db/index.ts").
- `app.ts` mounts the routers in the same order as today (data → categories → accounts → ai → bank, following the new split).

### BankProvider
One object per provider: `{ id, keysPath: "secrets" | "keys", institutionsPath: "institutions" | "aspsps", saveKeys(body), institutions(), connect(body, frontend), sync(), status() }`. The path segment equals the response key, so `{ institutions }` / `{ aspsps }` stay compatible. `routes.ts` registers the same URLs in a loop, and the Enable Banking callback stays a separate handler. `syncProvider()` in `banking/index.ts` does the `insertTransactions` that used to live in `routes/bank.ts`.

### Verification
- `npm run typecheck`.
- `npm run snapshot -- --out <scratch>/after --compare <scratch>/base` must show no differences.
- `node server/index.ts` with `WYDATKI_ROOT` pointing at a copy of the database, then `curl /api/health` and `curl /api/meta`.

## Stage 2 — front
```
src/
  app/        App, AppContext, navigation, Layout, AccountSwitcher, metaApi.ts
  core/       http.ts (request/query/json + active account, from api.ts:24-55), format, period, colors, types,
              hooks/ (useAsync, useAction, useDismiss, useFileDrop, useWidth), ui/ (Icon, Modal, Notices, Segmented,
              CategoryTag, DownloadButton, MonthPicker), charts/
  features/   period/ (usePeriod, useComparison, PeriodBar, EmptyPeriod)
              transactions/ (api, useTransactionList, useTransactionEdits, PaymentPanel, TxMiniList, CommentNote, ExcludeToggle)
              categories/ (api: categories+rules+limits, CategorySelect, NewCategoryDialog, CategoryLimits, types.ts: CategoryScope)
              statistics/ (api: stats, insights, setRecurringStatus)   accounts/ (api, NewAccountDialog + BankSelect)
              importer/ (api, demoAddedMessage)   banking/ (api)   ai/ (api, AiEvaluationCard, aiCategorizedMessage)
              settings/ (api: saveAmountThresholds)
  views/      dashboard/, statistics/, payments/ (former Transactions.tsx), limits/, import/, settings/ (+ tabs/)
```
- Rules: `core` doesn't import `app`, `features` or `views`. `features` may import `core`, `app/AppContext` and other features only through `index.ts`. `views` never use `core/http.ts` directly.
- `src/api.ts` is removed and replaced by `xxxApi` objects in each feature.
- Only pages get the `View` suffix. CSS stays global (`index.css` keeps its order).
- Verification: `npm run typecheck`. Vite doesn't work in WSL, so the user runs `npm run build` / `npm run dev` on Windows and clicks through the 6 screens.

## Stage 3 — tests
- `npm test` = `node --test` over `server/**`, `shared/**`, `src/core/**` and `src/features/**` (`*.test.ts`).
- `server/testing.ts`: `withTestDb(fn)` = import `schema.ts` + `openDatabase(":memory:")` + `withDatabase`. "Today" gets a fixed date through `mock.timers`.
- First batch:
  - importer: PKO fixture with pinned `id`s, fields, CP-1250, `Blokada`, duplicate rows, re-import.
  - categories: rule order, hidden categories.
  - statistics: filters, `excluded`, limits, recurring payments.
  - `shared` and `period.ts`.
  - front api clients, with a `fetch` stub.
- Front files tested under Node need imports with the `.ts` extension, in `src/core/*` and `features/*/api.ts`.
- A boundary test checks import direction and imports of other modules' internal files.

## Finally
Update `AGENTS.md` (file map, "Architektura kodu", module rules, `npm test`, fixture) and `CLAUDE.md` ("There are no automated tests" → `npm test`). Keep CRLF. Delete this file once the work is done.
