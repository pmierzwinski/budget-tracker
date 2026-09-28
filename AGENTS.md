# Wydatki — kontekst dla agenta

Lokalna aplikacja (jeden użytkownik, jeden komputer) do analizy wydatków z kont w polskich bankach (zaczęło się od **PKO BP**, teraz obsługuje kilka banków i kilka kont naraz). UI i komunikaty są **po polsku** — nowe teksty też pisz po polsku, krótko i konkretnie.

## Uruchamianie

```bash
npm install
npm run dev      # API :8787 (tsx watch) + Vite :5173, proxy /api → 8787
npm run typecheck  # tsc dla server/+shared/ (tsconfig.json) i src/+shared/ (tsconfig.app.json)
npm run build    # typecheck + vite build → dist/
npm start        # samo API; jeśli istnieje dist/, serwuje też frontend
npm run package:win  # release/Wydatki-Windows.zip (Wydatki.exe + dist/), tylko na Windows
npm run snapshot -- --out <katalog> [--compare <baseline>]  # zrzut odpowiedzi API (patrz niżej)
```

- Node 22+ (używa wbudowanego `node:sqlite`, stąd ostrzeżenie „ExperimentalWarning” w logach — to normalne).
- Baza: `data/wydatki.db` (w `.gitignore`). Brak testów automatycznych — weryfikuj przez `curl`/`Invoke-RestMethod` na API i w przeglądarce.
- **Siatka bezpieczeństwa przy refaktorach serwera:** `scripts/api-snapshot.mjs` uruchamia API na kopii bazy (domyślnie `data/wydatki.db`, oryginał nietknięty), zapisuje odpowiedzi ~50 zapytań GET z różnymi filtrami oraz stałą sekwencję zmian (import fixture CSV dwa razy, demo, kategorie, reguły, limity, ukrywanie…), a `--compare` pokazuje różnice. Najpierw zrób baseline przed zmianą, potem porównaj. Id z importu CSV porównuje dosłownie (nie mogą się zmienić). Baseline z konta demo jest ważny tylko tego samego dnia (demo kończy się „dziś”).
- Serwer da się uruchomić też bez `tsx`: `node server/index.ts` (wbudowane usuwanie typów w Node 22.18+). Dlatego w TS obowiązuje `erasableSyntaxOnly` — bez `enum`, `namespace`, parameter properties.
- Środowisko użytkownika: Windows + PowerShell (`curl` to alias `Invoke-WebRequest`; używaj `curl.exe` albo `Invoke-RestMethod`).
- `.env` (opcjonalny, ładowany przez `server/runtime.ts` z `appRoot`): `PORT`, `PUBLIC_URL`, `HOSTED`, `HOSTED_MAX_SESSIONS`, `DOWNLOAD_URL`, `GOCARDLESS_SECRET_ID/KEY`, `ENABLEBANKING_APP_ID`, `ENABLEBANKING_KEY_PATH`, `OPENAI_API_KEY`, `OPENAI_MODEL` (domyślnie `gpt-4o-mini`), `OPENAI_BASE_URL`. Klucze wklejone w UI (Ustawienia) trafiają do tabeli `settings` i mają pierwszeństwo przed `.env`.

## Stack

- Backend: Express 5 + TypeScript uruchamiany przez `tsx` (importy z rozszerzeniem `.ts`), `node:sqlite`, `multer` (upload), `papaparse` + `iconv-lite` (CSV).
- Frontend: React 19 + Vite, **bez routera, bez biblioteki UI, bez bibliotek wykresów**. Wykresy to ręczny SVG/CSS w `src/components/charts/`. Style: `src/index.css` importuje po kolei pliki z `src/styles/`.
- Nawigacja: stan `page` w `src/app/App.tsx`; typ `Page` wynika z `NAV_GROUPS` w `src/app/navigation.ts`.

## Skąd dane z banków

API PSD2 banków jest tylko dla licencjonowanych pośredników (AISP) — bank nie wyda „klucza API” osobie prywatnej, więc aplikacja **nie loguje się do bankowości**. Ścieżki:

1. **Import CSV** (główna). `server/csv/` — `parseBankCsv(buffer, { bank?, categorize })` → `{ bank, iban, items }` (bez konta — przypisuje je trasa importu przez `resolveImportAccount`); lista `BANKS` w `csv/banks.ts` (pko, mbank, ing, santander, pekao, millennium, alior, revolut, credit_agricole, generic):
   - kodowanie: UTF-8, a przy „krzakach” (`³œ¹`…) fallback na Windows-1250; separator `,`/`;`/tab wykrywany; bank wykrywany z nagłówków (`detectBank`), chyba że użytkownik wybierze go ręcznie; nagłówki normalizowane (bez polskich znaków, małe litery), każdy bank ma profil kolumn;
   - **PKO**: nagłówek `"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","","",…` — **szczegóły opisu leżą w kolejnych, bezimiennych kolumnach** (`Tytuł:`, `Lokalizacja: Adres: … Miasto: … Kraj: …`, `Nazwa odbiorcy:`, `Nazwa nadawcy:`). Parser skleja je w `description` i wyciąga `payee`/`title`; `id` są identyczne jak w dawnym `pko-csv.ts` (sprawdzone na fixture), więc stare importy nie dublują się;
   - wiersze `Blokada` / statusy oczekujące są pomijane; kolumny obciążenia/uznania są scalane w `amount`; Revolut dolicza opłatę;
   - **tylko PKO jest sprawdzony na prawdziwym pliku.** Profile mBank/ING/Santander/Pekao/Millennium/Alior/Revolut/Credit Agricole są zrobione wg znanych formatów eksportu — przy pierwszym prawdziwym pliku z danego banku zweryfikuj `payee`/daty/kwoty;
   - `date` = **data waluty** (księgowania), `bookingDate` = data operacji (tak, nazwy są odwrócone względem intuicji — patrz migracja `migration.value_date` w `db/schema.ts`);
   - `id` to hash pól (`csv/draft.ts`, `hashId` z `server/transaction.ts`); identyczne wiersze w jednym pliku dostają sufiks, więc nie giną; ponowny import tego samego pliku pomija duplikaty (`INSERT OR IGNORE`). Profile kolumn: `csv/profiles.ts`, PKO: `csv/pko.ts`, pozostałe + Santander bez nagłówków: `csv/mapped.ts`, parsowanie komórek (kodowanie, kwoty, daty): `csv/cells.ts`.
2. **Open Banking** — dwóch dostawców, wybór w Ustawienia → Połączenie z bankiem:
   - **Enable Banking** (`server/banking/enablebanking.ts`, zalecany — darmowy tryb prywatny dla własnych kont). JWT RS256 podpisany kluczem aplikacji (`kid` = Application ID). `/aspsps?country=PL` → `/auth` → callback `GET /api/bank/enablebanking/callback` (**ten adres użytkownik rejestruje jako Redirect URL** — liczony z `PUBLIC_URL` albo `http://localhost:PORT`, niezależnie od `dist/`) → `/sessions` → konta. Sesje w `settings.enablebanking_sessions`; po callbacku serwer wraca na front, z którego kliknięto „Połącz” (`settings.enablebanking_return`), z `?bank=connected&provider=enablebanking` albo `?bank=error&message=`.
   - **GoCardless Bank Account Data** (`server/banking/gocardless.ts`) — nowe rejestracje są wstrzymane, zostawiony dla istniejących kont. Lista instytucji z API, sandbox `SANDBOXFINANCE_SFIN0000`; powrót na `/?bank=connected&provider=gocardless`.
   - W obu przypadkach front (`app/navigation.ts` → `readBankCallback`) otwiera Ustawienia → bank i robi auto-sync. Synchronizacja tworzy/łączy lokalne konta po IBAN / zewnętrznym id (`upsertLinkedAccount` w `db/accounts.ts`); obaj dostawcy budują transakcje przez `newTransaction` i kategoryzują jednym `userCategorizer()` na całą synchronizację.

## Model danych (SQLite)

- `transactions` — `amount` ujemne = wydatek, dodatnie = przychód; `category` (pusta traktowana jak „Inne”), `comment` (max 80 znaków), `excluded` (0/1, „ukryta w statystykach”), `account_id`, `source`: `csv | gocardless | enablebanking | demo`.
- `accounts` — `id, name, bank, iban, provider ('' | gocardless | enablebanking), external_id`. Każda transakcja należy do konta. Usunięcie konta kasuje jego transakcje. Kategorie, reguły i limity są **wspólne** dla wszystkich kont.
- `category_rules` — fraza → kategoria (dopasowanie `includes`, bez wielkości liter). Pierwsza pasująca reguła użytkownika wygrywa, potem wbudowane regexy z `server/categorize.ts`.
- `custom_categories`, `hidden_categories` (usunięte/przemianowane **wbudowane** kategorie — ich trafienia z regexów lądują w „Inne”), `category_limits` (limit miesięczny), `period_evaluations` (zapisane oceny AI, klucz = zakres + filtry + konto), `settings` (klucze, sesje banków, `amount_buckets`).
- Migracje robione ręcznie w `server/db/schema.ts`, uruchamiane przy każdym otwarciu bazy (`PRAGMA table_info` w `migrateColumns` / jednorazowe przez `once("migration.xxx", fn)` z flagą w `settings`). Nowa kolumna = nowy wiersz w `migrateColumns`; migracja danych = nowa funkcja przez `once`. Ważne: `migration.skip_flag` zamienił dawną kategorię „Poza statystykami” na `excluded = 1` + przeliczenie kategorii; `migration.accounts` przypisał stare transakcje do konta „PKO BP”. Przed tą zmianą zrobiono kopię `data/wydatki.backup-2026-09-27.db`.

## Reguły domenowe, których łatwo nie zauważyć

- **„Inne”** (`DEFAULT_CATEGORY`) = nieskategoryzowane. Nie da się jej usunąć ani przemianować; zawsze jest ostatnia na liście.
- **Ukryte płatności** (`excluded`) — to **flaga płatności, nie kategoria** (kategoria zostaje oryginalna). Ukryta płatność nie liczy się do wydatków/przychodów w KPI, wykresów, `byCategory`, limitów ani insights, ale **liczy się** do „Ile zostaje” (`byMonth`). Filtr `includeExcluded=1` pokazuje je z powrotem (przycisk „Pokaż ukryte” w Statystykach), `excludedOnly=1` zostawia tylko ukryte (chip „Ukryte” w Płatnościach). Przełącznik to `ExcludeToggle` (ikona oka). Służy do dużych jednorazowych wydatków i przelewów między własnymi kontami. Stała `LEGACY_SKIP_CATEGORY` jest już tylko dla migracji.
- **Konto** — aktywne konto wybiera się globalnie w sidebarze (`AccountSwitcher`, widoczny od 2 kont, zapamiętany w `localStorage` `wydatki.account`). `src/api.ts` trzyma je w module (`setActiveAccount`, ustawiane przez `App`) i dokleja `account=` do każdego zapytania; strony analizy przemontowują się przy zmianie konta (`key` w `app/App.tsx`, `followsAccount`). Pusty = wszystkie konta.
- **Kategorie liczone są saldem** (wydatki + wpływy w danej kategorii). Przelew przychodzący w kategorii wydatkowej zmniejsza jej wydatki — tak było od początku.
- Zmiana kategorii ma dwa zakresy (`CategorySelect`): lista zmienia **tylko tę płatność** (`onlyThis: true`); link **„Wszystkie od odbiorcy…”** otwiera `Modal` z wyborem kategorii i wyjaśnieniem, że zmienią się wszystkie dotychczasowe i przyszłe płatności od tego odbiorcy — tworzy/aktualizuje regułę z `suggestPattern(payee)`. W UI mówimy „odbiorca”, nie „pośrednik”.
- **Płatności cykliczne** (`getInsights`): ten sam odbiorca (klucz = `suggestPattern(...).toLowerCase()`) w ≥3 miesiącach, podobna kwota. Auto-status: „aktywna”, gdy ostatnia płatność jest w ostatnim lub przedostatnim miesiącu danych. Użytkownik nadpisuje status (`auto | active | ended | hidden`) przez `PUT /recurring` → `settings.recurring_overrides` (JSON klucz → status). Kolejność (serwer i front, `RECURRING_ORDER`): nowe/nieprzejrzane (`auto`) na górze, potem ręcznie aktywne, zakończone, a `hidden` („to nie cykliczna”) na samym dole — **nie znikają**, są tylko wyszarzone (samo wykrycie jest informacją).
- **Konto testowe** — `POST /import/demo` (`{ uncategorized?: boolean }`) generuje (`server/demo.ts`) ~6 miesięcy przykładowych płatności kończących się dziś na koncie „Konto testowe” albo — z `uncategorized` — „Konto testowe bez kategorii” (wszystko w „Inne”, do testowania reguł/AI); bank `generic`, `source = demo`. Ponowne wywołanie usuwa to konto (po nazwie) i tworzy od nowa. Przyciski: Import („Dodaj konto testowe” / „Dodaj bez kategorii”) i Ustawienia → Konta (okno z wyborem wariantu). Kategorie/reguły są wspólne, więc reguły tworzone na koncie testowym działają też na prawdziwych danych.
- Usunięcie reguły uruchamia `recategorizeAll()` (przelicza wszystko od nowa).
- Limity są miesięczne; dla dowolnego zakresu dat są skalowane przez `periodMonthFactor` (proporcjonalnie do dni). Status: `ok` < 85% ≤ `warn` ≤ 100% < `over`.
- **Wielkość płatności** — granice przedziałów w `settings.amount_buckets` (domyślnie `100, 200, 300, 500`, max 9, sortowane i bez duplikatów), edycja w Ustawienia → Wykresy. `byAmount` zwraca `{ id, label, min, max, amount, count }`, a front filtruje przez `bucketQuery(bucket)`.
- **Oś czasu w Statystykach** — `autoGranularity`: 30 dni / miesiąc / 90 dni → dzień, cały okres → miesiąc, własny: ≤92 dni dzień, ≤365 tydzień, więcej miesiąc; ręczny przełącznik Dzień/Tydzień/Miesiąc. Dane z `byDayCategory`, kubełki z `buildBuckets` (`src/period.ts`), model wykresu w `pages/stats/useTrendChart.ts`.
- Filtr `category` w API przyjmuje kilka nazw po przecinku (multi-select na Przeglądzie: Ctrl+klik).
- AI (`server/ai.ts`, OpenAI-compatible `/chat/completions`, JSON mode):
  - kategoryzacja bierze tylko płatności z „Inne”, grupuje je po pośredniku i zapisuje wynik jako **reguły**, więc przyszłe importy łapią się bez AI;
  - ocena okresu to 4–8 zdań po polsku o bieżącym widoku (okres + filtry); ton: rzeczowy, bez coachingu — trzymaj się tego przy zmianach promptu.

## API (wszystko pod `/api`)

| Endpoint | Co robi |
| --- | --- |
| `GET /meta[?account]` | zakres dat, liczniki (`uncategorized`, `excluded`), kategorie, limity, reguły, `hasAiKey`, `accounts`, `banks`, `amountThresholds` |
| `GET /transactions`, `GET /stats`, `GET /insights` | wspólne filtry: `from, to, category, q, minAmount, maxAmount, kind=all\|expense\|income, sort, account, includeExcluded, excludedOnly, weekday` (`weekday` = dzień jak w JS: 0 niedziela … 6 sobota, po `date`). `insights` = top odbiorcy, największe wydatki, płatności cykliczne (z całej historii), statystyki dzienne |
| `PATCH /transactions/:id` | `{ category, onlyThis }` i/lub `{ comment }` i/lub `{ excluded }` |
| `POST/PATCH/DELETE /categories`, `PUT /category-limits` | CRUD kategorii i limitów |
| `GET/POST /rules`, `DELETE /rules/:id` | reguły fraz |
| `GET/POST /accounts`, `PATCH/DELETE /accounts/:id` | konta |
| `GET/PUT /settings/amount-buckets` | `{ thresholds }` |
| `PUT /recurring` | `{ key, status: auto\|active\|ended\|hidden }` — ręczny status płatności cyklicznej |
| `POST /import` (multipart `file`, `account=auto\|new\|<id>`, `accountName`, `bank`, `replaceCsv=1`, `ai=1`), `POST /import/demo` (konto testowe), `DELETE /data[?all=1]` | import i czyszczenie; `auto` łączy po IBAN, potem po banku, inaczej tworzy konto |
| `POST /ai/key`, `POST /ai/categorize`, `GET /ai/evaluations`, `POST /ai/evaluate` | AI |
| `GET /bank/status` | `{ gocardless, enablebanking: { hasKeys, appId, redirectUrl, sessions }, accounts }` |
| `/bank/gocardless/*` | `secrets`, `institutions`, `connect`, `sync` |
| `/bank/enablebanking/*` | `keys`, `aspsps`, `connect`, `callback`, `sync` |

Front woła API wyłącznie przez `src/api.ts`. Kształty danych (i odpowiedzi API) są w jednym miejscu: `shared/types.ts` — używa ich serwer i front (`src/types.ts` tylko je re-eksportuje). Serwer sprawdza zgodność przez `satisfies Meta` / `satisfies ImportResult` itd. w trasach.

## Ekrany

Sidebar: przełącznik konta (od 2 kont), potem dwie grupy: **Analiza** (Przegląd, Statystyki, Płatności, Limity) i **Dane** (Import, Ustawienia). Nawigacja: `navigate(page, settingsTab?)` z `useApp()` (typ `Navigate` z `app/navigation.ts`) — tak linkuj np. „Ustaw klucz AI” → `("settings", "ai")`.

- **Przegląd** (`pages/dashboard/`: `Dashboard` + `HeroSummary`, `CategoryChartCard`, `MiniCharts`, `NoDataYet`) — domyślnie ostatni miesiąc z danymi. Układ `dash-grid`: lewa kolumna (hero z KPI + porównanie do poprzedniego porównywalnego okresu + ocena AI, obok wykres kategorii słupki/kołowy — tam też widać przekroczone limity; pod spodem mini-wykresy: dni tygodnia i wielkość płatności — **oba klikalne, filtrują listę** (chip „Piątki” / „100–200 zł”), miesiące). Panelu limitów na Przeglądzie celowo nie ma (jest zakładka Limity). Prawa kolumna to przyklejony **`PaymentPanel`** z listą płatności filtrowaną kliknięciami w wykresy (tam też `ExcludeToggle`).
- **Statystyki** (`pages/stats/`: `Stats` trzyma stan i układ, każda karta w osobnym pliku — `TrendCard`, `DrillPanel`, `LeftoverCard`, `MonthMatrixCard`, `DailyCard`, `CompareCard`, `TopPayeesCard`, `BiggestCard`, `RecurringCard`) — `PeriodBar` z `sticky` (przyklejony u góry przy przewijaniu, klasa `.stuck` dodaje cień; ≤760px wraca do zwykłego). Linie kategorii w czasie (podział dzień/tydzień/miesiąc, „Pokaż ukryte”, ręczna oś Y — „Oś Y do” **ucina** wszystko powyżej przez `clipPath`, przerywana linia u góry sygnalizuje ucięcie). „Szczegóły okresu” (`.insight-grid`) to flex-wrap: karty rosną, żeby nie zostawało puste miejsce; „Gdzie idzie najwięcej” ma `.grow` (2×), „Porównanie” (`.compare`) idzie na koniec, cykliczne (`.wide`) na pełną szerokość. Tooltip stoi w górnym rogu wykresu **po przeciwnej stronie niż kursor** (kursor w lewej połowie → tooltip z prawej i odwrotnie). **Klik w punkt** otwiera pod wykresem `DrillPanel` z płatnościami tej kategorii w tym kubełku; **klik w kategorię w legendzie** izoluje ją i otwiera `DrillPanel` dla całego okresu (`PERIOD_KEY`), drugi klik przywraca wszystko. Dalej: pasek oceny AI, „Ile zostaje”, macierz kategoria × miesiąc (tylko gdy ≥2 miesiące), sekcja „Szczegóły okresu”: dzień po dniu, porównanie z poprzednim okresem, top odbiorcy, największe wydatki, płatności cykliczne (status w `select.status-select`: auto / aktywna / zakończona / to nie cykliczna).
- **Płatności** (`Transactions.tsx`) — pełna tabela: wyszukiwarka (też po komentarzach), segment rodzaju, kategoria, zakres kwot, chip „Nieskategoryzowane”, chip „Ukryte”, przycisk AI (bez klucza: „Ustaw klucz AI, żeby kategoryzować”), sortowanie po nagłówkach, komentarze inline (`CommentNote`), ukrywanie (`ExcludeToggle`).
- **Limity** (`Limits.tsx`) — KPI, wykorzystanie w okresie (`CategoryLimits` bez `onSelect`), tabela z edycją limitu miesięcznego każdej kategorii.
- **Import** (`ImportPage.tsx`) — wybór konta (auto / istniejące / „+ Nowe konto…” w `Modal`) i banku (albo „Rozpoznaj z pliku”), instrukcja „Skąd wziąć plik” dla wybranego banku, demo, czyszczenie.
- **Ustawienia** (`Settings.tsx` + `pages/settings/*Tab.tsx`) — zakładki: Kategorie (lista, zmiana nazwy, usuwanie, „Nowa kategoria” w `NewCategoryDialog`, reguły), AI (klucz OpenAI + kategoryzacja), Konta, Połączenie z bankiem (Enable Banking / GoCardless), Wykresy (przedziały kwot).
- Okna dialogowe: `Modal.tsx` (natywny `<dialog>`, fokus na pierwsze pole). Nie używaj `window.prompt`; `confirm` tylko dla operacji nieodwracalnych.
- `PeriodBar` jest nagłówkiem każdej strony analizy: eyebrow z nazwą strony, strzałki ‹ › (także klawisze ←/→) przesuwające okres o jego długość, tytuł otwierający picker miesięcy, „Ten miesiąc” przy tytule (gdy jesteśmy w innym okresie), segment Ten miesiąc / 30 dni / 90 dni / Cały okres / Własny (duplikat „Ten miesiąc” jest celowy — na prośbę użytkownika). Prop `sticky` przykleja go do góry strony.

## Design system („nowy design”, commit `3c05d51`)

Jasny, spokojny, „fintech/dashboard” — biała karta na szarym tle, granatowy akcent, złoto tylko w logo. Style w `src/styles/*.css` (jeden plik na sekcję, nagłówek `/* ---------- Nazwa ---------- */`); `src/index.css` to tylko `@import` w kolejności kaskady — nowy plik dopisz w odpowiednim miejscu listy, `responsive.css` zostaje ostatni. Tokeny w `styles/tokens.css`.

**Tokeny (`:root`) — używaj ich, nie wpisuj kolorów na sztywno:**

- Tło/powierzchnie: `--bg #f5f6f8`, `--surface #fff`, `--surface-2`, `--surface-3`; linie `--line`, `--line-soft`, `--line-strong`.
- Tekst: `--ink #101828`, `--ink-2`, `--muted #667085`, `--faint`.
- Akcent: `--accent #1d3f73` (+ `-hover`, `-soft`, `-soft-2`), `--focus`; `--gold #f5c518` (logo).
- Semantyka: `--income` zielony, `--expense` czerwony, `--warn` bursztyn, `--ai #6941c6` fiolet — każdy z wariantem `-soft` na tła.
- `--radius 14px`, `--radius-sm 9px`, cienie `--shadow-sm/md/lg`, odstępy strony `--pad-y/--pad-x`.
- Font: **Inter** (Google Fonts w `index.html`), bazowo 15px; kwoty w tabelach `tabular-nums` (klasa `.num`).

**Klasy do ponownego użycia (zanim dodasz nową, sprawdź czy nie ma gotowej):**

- Layout: `.page` (kolumna z odstępem 1rem, max 1640px), `.page-head` + `.eyebrow` + `h1` (strony „Dane”), `.split` (2 kolumny 1.55fr/1fr), `.stack`, `.row`.
- Karty: `.card`, `.card-head` (+ `h2` i `.card-sub`), `.card-foot`, `.empty-card`.
- Przyciski: `.primary` (granatowy), `.ghost` (obrys), modyfikatory `.sm`, `.lg`, `.danger`; `.link-btn` (`.quiet`), `.icon-btn`, `.step-btn`, `.segmented` (grupa przełączników, aktywny `.active` + `aria-pressed`), `.toggle-chip`, `.filter-chip`.
- Status: `.banner.ok|.error` (`.dismissible`, `.with-action`), `.pill.ok|.over`, `.count`, `.pos`/`.neg`, `.muted`.
- Formularze: `.field`, `.check` (checkbox + `<small>` opis), `.inline-form`, `.money-input`, `.search-field`, `.amount-range`.
- AI: `.ai`, `.ai-badge` (fioletowy, ikona `sparkle`), `.ai-dialog` (natywny `<dialog>`), `.ghost.ai-setup` (przycisk „Ustaw klucz AI”).
- Tabele: `.table-wrap` (`.flat` wewnątrz karty), `.th-sort`, `.matrix` ze `.sticky-col`, `.compact-table` (+ `tfoot`), `.cell-name`.
- Nowsze: `.modal` / `.modal-body` / `.modal-content`, `.field-hint(.warn)`, `.scope-choice`/`.scope-option`, `.exclude-toggle(.on,.compact)` + wiersze `.excluded`, `.drill-card`/`.drill-list`, `.section-head`, `.insight-grid` (`> .wide`), `.stat-grid`, `.kpi-row`/`.kpi`, `.limit-table`/`.limit-line`, `.account-switch`/`.account-menu`, `.account-list`, `.settings-tabs`, `.provider-switch`, `.copy-field`, `.file-btn`, `.threshold-*`.

**Ikony:** `src/components/Icon.tsx` — ręczne ścieżki SVG 24×24, obrys 1.9, `currentColor`. Nową ikonę dodaj do `PATHS`, nie instaluj paczki ikon.

**Kolory kategorii:** `CATEGORY_COLORS` + `categoryColor(name)` w `src/colors.ts` (swatch jako komponent: `Swatch` / `CategoryTag` z `components/ui/CategoryTag.tsx`) (dla nowych nazw kolor z hasha). Nie mieszaj ich z tokenami semantycznymi.

**Responsywność:** ≤1360px sidebar zwija się do 72px (same ikony), ≤1080px `dash-grid`/`split` przechodzą w jedną kolumnę, a `PaymentPanel` przestaje być sticky, ≤760px sidebar staje się paskiem. Jest `prefers-reduced-motion`.

**Konwencje UI:**

- Formatowanie liczb i dat tylko przez `src/format.ts` (`money`, `roundMoney`, `compactMoney`, `percent`, `signedPercent`, `formatDay`, `monthLabel`, `txName`…) — `pl-PL`, złotówki. Okresy (presety, przesuwanie, opis, porównanie, kubełki osi czasu): `src/period.ts`.
- Dostępność: `type="button"`, `aria-label` na przyciskach-ikonach, `aria-pressed`/`aria-expanded` na przełącznikach, `:focus-visible` z `--focus`.
- Po zapisie rób optymistyczną aktualizację stanu, a przy błędzie przeładuj dane i pokaż `.banner.error` — dla płatności robi to `useTransactionEdits`, dla akcji w ustawieniach `useAction` (patrz „Architektura kodu”).
- Puste stany zawsze z konkretną akcją (np. „Ostatni miesiąc z danymi”, „Importuj historię”).
- Styl kodu: brak komentarzy opisujących oczywistości, nazwy po angielsku, teksty UI po polsku.

## Tryby uruchomienia: lokalny, online, exe

- **Baza per żądanie.** `db` w `server/db/core.ts` to `Proxy` na bazę z `AsyncLocalStorage` (`withDatabase`, `openDatabase`). Lokalnie to plik `data/wydatki.db` otwierany leniwie. Zapytania piszesz jak dotąd przez `db`, nie trzymaj referencji do bazy w zmiennych modułu.
- **Online (`HOSTED=1`)** — do udostępnienia w sieci, żeby ktoś mógł się pobawić. `server/sessions.ts`: cookie `wydatki_sid` (HttpOnly, SameSite=Lax) → osobna baza **w pamięci** na sesję (24 h bezczynności, max `HOSTED_MAX_SESSIONS`=500, najstarsze wypadają; restart serwera czyści wszystko). `multer` gubi kontekst async, dlatego trasa importu ma `reenterSession` po `upload.single` — nowe trasy z uploadem też tego potrzebują. W tym trybie: klucze z `.env` są ignorowane (`serverEnv()` zwraca ""), `/api/bank/*` zwraca 403, `trust proxy` włączone, brak `cors`. Front (`meta.app.hosted`) pokazuje notkę „Wersja online”, pusty Przegląd z „Wygeneruj dane testowe”, baner na Imporcie i zamiast połączenia z bankiem kartę „działa tylko w aplikacji”.
- **Exe (`npm run package:win`)** — `scripts/package-win.mjs`: vite build → esbuild `server/index.ts` do CJS (`import.meta.url` podmienione) → blob Node SEA → kopia `node.exe` jako `Wydatki.exe` + postject → `dist/` + `CZYTAJ.txt` → zip przez `tar.exe`. Wynik w `release/` (w `.gitignore`). `packaged` = `node:sea` `isSea()`; wtedy `appRoot` = folder exe (tam `data/`, `dist/`, `.env`), serwer słucha na `127.0.0.1`, otwiera przeglądarkę (`WYDATKI_NO_BROWSER=1` wyłącza — do testów), przy zajętym porcie sprawdza `/api/health` (`app: "wydatki"`): nasza instancja → tylko otwiera przeglądarkę, obca → kolejny port (do 10). Exe nie jest podpisane (SmartScreen) i ma ikonę Node.
- **Pobieranie** — `GET /download/Wydatki-Windows.zip` serwuje plik z `release/`. `meta.app.downloadUrl` = `DOWNLOAD_URL` albo ten adres, gdy zip istnieje; w exe zawsze pusty. Przycisk `DownloadButton` (`components/DownloadButton.tsx`) jest w sidebarze, w pustym Przeglądzie (online) i w zakładce banku (online).

## Architektura kodu

**`shared/`** — kod używany przez serwer i front (bez `node:`, bez `import.meta`, importy z `.ts`): `types.ts` (wszystkie kształty danych i odpowiedzi API), `domain.ts` (`DEFAULT_CATEGORY`, `BUILTIN_CATEGORIES`, `compareRecurring`, `limitStatus`, przedziały kwot `amountBucketDefs`/`bucketQuery`, `suggestPattern`, `merchantPattern`, `payeeLabel`, `evaluationKey`), `dates.ts`, `numbers.ts` (`round2`, `parseDecimal`). Reguła wymyślona raz ma żyć tutaj, a nie w dwóch kopiach.

**Serwer:**
- `server/db/` — warstwy, niższa nie importuje wyższej: `core` (Proxy `db`, `transaction(fn)`, `forAccount`) → `settings` (`getSetting`, `getJsonSetting`/`setJsonSetting`, progi kwot) → `categories` → `rules` (`userCategorizer()` = reguły + ukryte kategorie, buduj raz na partię) → `accounts`, `transactions` (`filterClause`, `selectTransactions`, liczniki) → `limits` → `stats`, `insights` (+ statusy cyklicznych), `evaluations`. `schema.ts` (tabele + migracje) rejestruje się w `core` przy imporcie `db/index.ts` — **importuj bazę zawsze z `db/index.ts`**.
- `server/routes/` — trasy pogrupowane (`data`, `categories`, `accounts` z importem, `ai`, `bank`). Każdy handler owinięty w `route("Komunikat awaryjny", (req) => wynik)`: zwrócona wartość idzie jako JSON, `throw new Error("Po polsku…")` daje 400 `{ error }`. Filtry z query/body zawsze przez `readFilters`, pola body przez `text()`/`typed()`. Logika biznesowa nie siedzi w trasach (klucze dostawców, konto importu, demo → moduły domenowe).
- `server/app.ts` składa aplikację (tryb online, CORS, `/download`, trasy, `dist/`), `server/index.ts` tylko nasłuchuje (port, przeglądarka w exe). Ścieżki i adresy (`port`, `publicUrl`, `apiUrl`, `frontendUrl`, `downloadUrl`) są w `runtime.ts`.
- `server/transaction.ts` — `newTransaction` (wspólny kształt nowej płatności) i `hashId`; używają go CSV, Enable Banking, GoCardless i demo. `server/banking/http.ts` — wspólny `providerFetch` dla dostawców.

**Front:**
- `app/AppContext.tsx` + `useApp()` — `meta` (odpowiedź `/api/meta`: konta, banki, kategorie, limity, reguły, liczniki, klucz AI, progi, tryb aplikacji), `refreshMeta()`, `account`/`chooseAccount`, `reloadPage()`, `navigate`. `App` pobiera świeże `/meta` przy każdej zmianie strony/konta i montuje stronę dopiero po nim, więc strony czytają dane z kontekstu zamiast pobierać `/meta` same. Po zmianie, która wpływa na te dane (kategoria, limit, konto, klucz AI…), wołaj `await refreshMeta()`.
- `hooks/`: `useAsync(load, deps, delay?)` (ładowanie z odrzucaniem nieaktualnych odpowiedzi, `reload`, `setData`), `useTransactionList` (lista płatności + updatery), `useTransactionEdits` (kategoria/komentarz/ukrycie: optymistycznie tylko edytowany wiersz, potem `onSaved` / przy błędzie `onFailed`). **Po zmianie kategorii „od odbiorcy” ani po ukryciu nie przeładowuj listy** — wiersz musi zostać na miejscu (także w przefiltrowanym widoku i w „Największych wydatkach”), żeby dało się zmianę od razu cofnąć; odświeżaj tylko sumy/wykresy i `refreshMeta()`, `useAction` (busy + baner ok/błąd + `run(fn, fallback)`), `usePeriod("month" | "all")`, `useComparison` (poprzedni porównywalny okres), `useDismiss`, `useFileDrop`.
- `components/ui/`: `Notices` (banery ok/błąd, opcjonalnie z zamknięciem), `Segmented`, `CategoryTag`/`Swatch`; oraz `EmptyPeriod`, `NewAccountDialog`/`BankSelect`, `DownloadButton`, `AccountSwitcher`, `MonthPicker`. Wspólne komunikaty wyników: `src/messages.ts`.

## Mapa plików

```
shared/           typy i reguły wspólne dla serwera i frontu
server/
  index.ts        start serwera (port, przeglądarka w exe)
  app.ts          aplikacja Express: middleware, trasy, dist/
  routes/         http.ts (route, readFilters) + data, categories, accounts, ai, bank
  db/             core, settings, categories, rules, accounts, transactions, limits, stats, insights,
                  evaluations, rows (mapowanie wierszy), schema (tabele + migracje), index (barrel)
  csv/            parser CSV: index (parseBankCsv), banks, cells, profiles, draft (id), pko, mapped
  banking/        enablebanking, gocardless, http (providerFetch)
  transaction.ts  newTransaction, hashId
  categorize.ts   wbudowane reguły regex, categorizer()
  ai.ts           OpenAI: kategoryzacja i ocena okresu
  demo.ts         „Konto testowe” (generator + resetDemoAccount)
  runtime.ts      appRoot, packaged/hosted, .env, serverEnv(), porty i adresy
  sessions.ts     tryb online: sesje (cookie) → baza w pamięci
  fixtures/pko-przyklad.csv   przykładowy wyciąg PKO (do testów parsera i snapshotu)
scripts/
  package-win.mjs budowanie Wydatki.exe (Node SEA + postject) i zipa
  api-snapshot.mjs  zrzut/porównanie odpowiedzi API na kopii bazy
src/
  main.tsx        render <App />
  app/            App (strony, /meta, konto), AppContext (useApp), navigation (Page, NAV_GROUPS, callback banku)
  api.ts          klient API
  types.ts        re-eksport shared/types.ts
  format.ts       formatowanie kwot, dat, nazw
  period.ts       okresy i kubełki osi czasu
  colors.ts       kolory kategorii
  messages.ts     wspólne komunikaty wyników
  hooks/          useAsync, useAction, usePeriod, useComparison, useTransactionList, useTransactionEdits, …
  styles/         design system (tokens, base, …, responsive), importowany przez index.css
  components/     Layout, AccountSwitcher, PeriodBar, MonthPicker, PaymentPanel, CategorySelect, CommentNote,
                  CategoryLimits, AiEvaluationCard, Icon, Modal, NewCategoryDialog, NewAccountDialog,
                  EmptyPeriod, ExcludeToggle, DownloadButton; charts/ (wykresy SVG); ui/ (drobne klocki)
  pages/          Transactions, Limits, ImportPage, Settings; dashboard/, stats/, settings/ (zakładki)
```

## Na co uważać

- Nie commituj `data/`, `.env` ani prawdziwych wyciągów (zawierają dane osobowe i numery kont).
- Nie dodawaj ciężkich zależności (chart.js, MUI, router itp.) bez wyraźnej prośby — projekt celowo jest lekki.
- Zmieniając parser CSV, sprawdź go na prawdziwym pliku z danego banku (poproś użytkownika o ścieżkę) i upewnij się, że `payee` nie jest pusty. Dla PKO sprawdź też, że `id` się nie zmieniły (inaczej ponowny import zdubluje historię).
- Testując w przeglądarce Cursora: zrzuty ekranu potrafią być o krok spóźnione względem DOM — weryfikuj stan przez `Runtime.evaluate`. Konta/płatności testowe twórz przez API i usuwaj po teście.
- `README.md` jest krótki i częściowo nieaktualny — źródłem prawdy jest ten plik i kod.
