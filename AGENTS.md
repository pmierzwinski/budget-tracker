# Wydatki — kontekst dla agenta

Lokalna aplikacja (jeden użytkownik, jeden komputer) do analizy wydatków z kont w polskich bankach (zaczęło się od **PKO BP**, teraz obsługuje kilka banków i kilka kont naraz). UI i komunikaty są **po polsku** — nowe teksty też pisz po polsku, krótko i konkretnie.

## Uruchamianie

```bash
npm install
npm run dev      # API :8787 (node --watch) + Vite :5173, proxy /api → 8787
npm run typecheck  # tsc dla src/modules/ (tsconfig.json) i frontu src/ (tsconfig.app.json, src/modules/shared/ przez importy)
npm run build    # typecheck + vite build → dist/
npm run build:web  # wersja w przeglądarce (bez serwera, dane w IndexedDB) → dist-web/; podgląd: npm run dev:web
npm run build:android  # to samo z mode "android" → dist-android/ + cap sync; potem npm run android (Android Studio, .aab)
npm start        # samo API; jeśli istnieje dist/, serwuje też frontend
npm run package:win  # release/Wydatki-Windows.zip (Wydatki.exe + dist/), tylko na Windows
npm run snapshot -- --out <katalog> [--compare <baseline>]  # zrzut odpowiedzi API (patrz niżej)
```

- Node 22+ (używa wbudowanego `node:sqlite`, stąd ostrzeżenie „ExperimentalWarning” w logach — to normalne).
- Baza: `data/wydatki.db` (w `.gitignore`). Brak testów automatycznych — weryfikuj przez `curl`/`Invoke-RestMethod` na API i w przeglądarce.
- **Siatka bezpieczeństwa przy refaktorach serwera:** `scripts/api-snapshot.mjs` uruchamia API na kopii bazy (domyślnie `data/wydatki.db`, oryginał nietknięty), zapisuje odpowiedzi ~50 zapytań GET z różnymi filtrami oraz stałą sekwencję zmian (import fixture CSV dwa razy, demo, kategorie, reguły, limity, ukrywanie…), a `--compare` pokazuje różnice. Najpierw zrób baseline przed zmianą, potem porównaj. Id z importu CSV porównuje dosłownie (nie mogą się zmienić). Baseline z konta demo jest ważny tylko tego samego dnia (demo kończy się „dziś”).
- Serwer to zwykły `node src/modules/app/main.ts` (wbudowane usuwanie typów w Node 22.18+; `dev:server` = `node --watch` tylko na `src/modules/`, żeby zapis bazy nie restartował API). Dlatego w TS obowiązuje `erasableSyntaxOnly` — bez `enum`, `namespace`, parameter properties.
- Środowisko użytkownika: Windows + PowerShell (`curl` to alias `Invoke-WebRequest`; używaj `curl.exe` albo `Invoke-RestMethod`).
- `.env` (opcjonalny, ładowany przez `src/modules/core/Runtime.ts` z `appRoot`): `PORT`, `PUBLIC_URL`, `DOWNLOAD_URL`, `GOCARDLESS_SECRET_ID/KEY`, `ENABLEBANKING_APP_ID`, `ENABLEBANKING_KEY_PATH`, `AI_PROVIDER` (`openai` \| `gemini` \| `anthropic` \| `compatible`), `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `AI_MODEL` / `OPENAI_MODEL`, `OPENAI_BASE_URL` (też dla `compatible`). Klucze wklejone w UI (Ustawienia) trafiają do tabeli `settings` i mają pierwszeństwo przed `.env`.

## Stack

- Backend: Express 5 + TypeScript (Node 22+ z usuwaniem typów, importy z rozszerzeniem `.ts`), `node:sqlite`, `multer` (upload), `papaparse` + `TextDecoder` (CSV: UTF-8 / UTF-16 / Windows-1250). Wersja w przeglądarce: `sql.js` (SQLite w WASM).
- Frontend: React 19 + Vite, **bez routera, bez biblioteki UI, bez bibliotek wykresów**. Wykresy to ręczny SVG/CSS w `src/components/charts/`. Style: `src/index.css` importuje po kolei pliki z `src/styles/`.
- Nawigacja: stan `page` w `src/app/App.tsx`; typ `Page` wynika z `NAV_GROUPS` w `src/app/navigation.ts`.

## Skąd dane z banków

API PSD2 banków jest tylko dla licencjonowanych pośredników (AISP) — bank nie wyda „klucza API” osobie prywatnej, więc aplikacja **nie loguje się do bankowości**. Ścieżki:

1. **Import CSV** (główna). `src/modules/importer/csv/` — `CsvStatementParser.parse(buffer, { bank?, categorizer })` → `{ bank, iban, items }` (bez konta — przypisuje je `ImportService` przez `AccountService.resolveImport`); lista `BANKS` w `csv/banks.ts` (pko, mbank, ing, santander, pekao, millennium, alior, revolut, credit_agricole, generic):
   - kodowanie: UTF-8, a przy „krzakach” (`³œ¹`…) fallback na Windows-1250; separator `,`/`;`/tab wykrywany; bank wykrywany z nagłówków (`detectBank`), chyba że użytkownik wybierze go ręcznie; nagłówki normalizowane (bez polskich znaków, małe litery), każdy bank ma profil kolumn;
   - **PKO**: nagłówek `"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","","",…` — **szczegóły opisu leżą w kolejnych, bezimiennych kolumnach** (`Tytuł:`, `Lokalizacja: Adres: … Miasto: … Kraj: …`, `Nazwa odbiorcy:`, `Nazwa nadawcy:`). Parser skleja je w `description` i wyciąga `payee`/`title`; `id` są identyczne jak w dawnym `pko-csv.ts` (sprawdzone na fixture), więc stare importy nie dublują się;
   - wiersze `Blokada` / statusy oczekujące są pomijane; kolumny obciążenia/uznania są scalane w `amount`; Revolut dolicza opłatę;
   - **tylko PKO jest sprawdzony na prawdziwym pliku.** Profile mBank/ING/Santander/Pekao/Millennium/Alior/Revolut/Credit Agricole są zrobione wg znanych formatów eksportu — przy pierwszym prawdziwym pliku z danego banku zweryfikuj `payee`/daty/kwoty;
   - `date` = **data waluty** (księgowania), `bookingDate` = data operacji (tak, nazwy są odwrócone względem intuicji — patrz migracja `migration.value_date` w `transactions/schema.ts`);
   - `id` to hash pól (`csv/TransactionDrafter.ts`, `TransactionFactory.hashId`); identyczne wiersze w jednym pliku dostają sufiks, więc nie giną; ponowny import tego samego pliku pomija duplikaty (`INSERT OR IGNORE`). Profile kolumn i wykrywanie banku: `csv/ColumnProfiles.ts`, formaty (PKO, profil kolumn, Santander bez nagłówków): `csv/formats.ts`, parsowanie komórek (kodowanie, kwoty, daty): `csv/Cells.ts`.
2. **Open Banking** — dwóch dostawców, wybór w Ustawienia → Połączenie z bankiem:
   - **Enable Banking** (`src/modules/banking/EnableBankingProvider.ts`, zalecany — darmowy tryb prywatny dla własnych kont). JWT RS256 podpisany kluczem aplikacji (`kid` = Application ID). `/aspsps?country=PL` → `/auth` → callback `GET /api/bank/enablebanking/callback` (**ten adres użytkownik rejestruje jako Redirect URL** — liczony z `PUBLIC_URL` albo `http://localhost:PORT`, niezależnie od `dist/`) → `/sessions` → konta. Sesje w `settings.enablebanking_sessions`; po callbacku serwer wraca na front, z którego kliknięto „Połącz” (`settings.enablebanking_return`), z `?bank=connected&provider=enablebanking` albo `?bank=error&message=`.
   - **GoCardless Bank Account Data** (`src/modules/banking/GoCardlessProvider.ts`) — nowe rejestracje są wstrzymane, zostawiony dla istniejących kont. Lista instytucji z API, sandbox `SANDBOXFINANCE_SFIN0000`; powrót na `/?bank=connected&provider=gocardless`.
   - W obu przypadkach front (`app/navigation.ts` → `readBankCallback`) otwiera Ustawienia → bank i robi auto-sync. Synchronizacja tworzy/łączy lokalne konta po IBAN / zewnętrznym id (`AccountService.upsertLinked`); obaj dostawcy budują transakcje przez `TransactionFactory.create` i kategoryzują jednym `RuleService.categorizer()` na całą synchronizację.

## Model danych (SQLite)

- `transactions` — `amount` ujemne = wydatek, dodatnie = przychód; `category` (pusta traktowana jak „Inne”), `comment` (max 80 znaków), `excluded` (0/1, „ukryta w statystykach”), `manual_category` (0/1, kategoria ustawiona ręcznie na tej płatności — reguły ją omijają, chyba że `force`), `account_id`, `source`: `csv | gocardless | enablebanking | demo`.
- `accounts` — `id, name, bank, iban, provider ('' | gocardless | enablebanking), external_id`. Każda transakcja należy do konta. Usunięcie konta kasuje jego transakcje. Kategorie, reguły i limity są **wspólne** dla wszystkich kont.
- `category_rules` — fraza → kategoria (dopasowanie `includes`, bez wielkości liter). Pierwsza pasująca reguła użytkownika wygrywa, potem wbudowane regexy z `categories/categorizer/builtinRules.ts`.
- `custom_categories`, `hidden_categories` (usunięte/przemianowane **wbudowane** kategorie — ich trafienia z regexów lądują w „Inne”), `category_limits` (limit miesięczny), `period_evaluations` (zapisane oceny AI, klucz = zakres + filtry + konto), `settings` (klucze, sesje banków, `amount_buckets`).
- Migracje robione ręcznie w `schema.ts` każdego modułu, uruchamiane przy każdym otwarciu bazy (`Database`: `PRAGMA table_info` dla `columns`, jednorazowe `migrations` z flagą `migration.xxx` w `settings`). Nowa kolumna = nowy wpis w `columns`; migracja danych = nowa klasa `Migration` w `migrations`. Ważne: `migration.skip_flag` zamienił dawną kategorię „Poza statystykami” na `excluded = 1` + przeliczenie kategorii; `migration.accounts` przypisał stare transakcje do konta „PKO BP”. Przed tą zmianą zrobiono kopię `data/wydatki.backup-2026-09-27.db`.

## Reguły domenowe, których łatwo nie zauważyć

- **„Inne”** (`DEFAULT_CATEGORY`) = nieskategoryzowane. Nie da się jej usunąć ani przemianować; zawsze jest ostatnia na liście. Pozostałe kategorie (wbudowane i własne) usuwa się i przemianowuje tak samo: płatności, reguły i limit idą do nowej nazwy albo do „Inne”. Usunięta/przemianowana wbudowana ląduje w `hidden_categories`, żeby wbudowane regexy nie przywracały jej same. Reset (`DELETE /data?all=1`) czyści `hidden_categories` i `custom_categories` — wracają tylko wbudowane.
- **Ukryte płatności** (`excluded`) — to **flaga płatności, nie kategoria** (kategoria zostaje oryginalna). Ukryta płatność nie liczy się do wydatków/przychodów w KPI, wykresów, `byCategory`, limitów ani insights, ale **liczy się** do „Ile zostaje” (`byMonth`). Filtr `includeExcluded=1` pokazuje je z powrotem (przycisk „Pokaż ukryte” w Statystykach), `excludedOnly=1` zostawia tylko ukryte (chip „Ukryte” w Płatnościach). Przełącznik to `ExcludeToggle` (ikona oka). Służy do dużych jednorazowych wydatków i przelewów między własnymi kontami. Stała `LEGACY_SKIP_CATEGORY` jest już tylko dla migracji.
- **Konto** — aktywne konto wybiera się globalnie w sidebarze (`AccountSwitcher`, widoczny od 2 kont, zapamiętany w `localStorage` `wydatki.account`). `src/api.ts` trzyma je w module (`setActiveAccount`, ustawiane przez `App`) i dokleja `account=` do każdego zapytania; strony analizy przemontowują się przy zmianie konta (`key` w `app/App.tsx`, `followsAccount`). Pusty = wszystkie konta.
- **Kategorie liczone są saldem** (wydatki + wpływy w danej kategorii). Przelew przychodzący w kategorii wydatkowej zmniejsza jej wydatki — tak było od początku.
- Zmiana kategorii ma dwa zakresy (`CategorySelect`): lista zmienia **tylko tę płatność** (`onlyThis: true`, flaga `manualCategory`) — taka płatność jest wyjątkiem i reguły jej nie ruszają. Link **„Wszystkie od odbiorcy…”** otwiera `Modal` z kategorią i opcją **„Nadpisz też ręcznie ustawione”** (`force`); bez niej reguła pomija wyjątki. Powstaje/aktualizuje się reguła z `suggestPattern(payee)`. Wiersze zostają na przefiltrowanej liście (zmienia się tylko kategoria); znikną po kolejnym przeładowaniu filtra. Wynik ląduje w powiadomieniach (`category_changed`). W UI mówimy „odbiorca”, nie „pośrednik”.
- **Płatności cykliczne** (`RecurringDetector` w `statistics/InsightsService.ts`): ten sam odbiorca (klucz = `suggestPattern(...).toLowerCase()`) w ≥3 miesiącach, podobna kwota. Auto-status: „aktywna”, gdy ostatnia płatność jest w ostatnim lub przedostatnim miesiącu danych. Użytkownik nadpisuje status (`auto | active | ended | hidden`) przez `PUT /recurring` → `settings.recurring_overrides` (JSON klucz → status). Kolejność (serwer i front, `RECURRING_ORDER`): nowe/nieprzejrzane (`auto`) na górze, potem ręcznie aktywne, zakończone, a `hidden` („to nie cykliczna”) na samym dole — **nie znikają**, są tylko wyszarzone (samo wykrycie jest informacją).
- **Konto testowe** — `POST /import/demo` (`{ uncategorized?: boolean }`) generuje (`importer/demo/DemoGenerator.ts`, konto zakłada `ImportService.resetDemo`) ~6 miesięcy przykładowych płatności kończących się dziś na koncie „Konto testowe” albo — z `uncategorized` — „Konto testowe bez kategorii” (wszystko w „Inne”, do testowania reguł/AI); bank `generic`, `source = demo`. Ponowne wywołanie usuwa to konto (po nazwie) i tworzy od nowa. Przyciski: Import („Dodaj konto testowe” / „Dodaj bez kategorii”) i Ustawienia → Konta (okno z wyborem wariantu). Kategorie/reguły są wspólne, więc reguły tworzone na koncie testowym działają też na prawdziwych danych.
- Usunięcie reguły uruchamia `RuleService.recategorizeAll()` (przelicza wszystko od nowa, z pominięciem ręcznie ustawionych).
- Limity są miesięczne; dla dowolnego zakresu dat są skalowane przez `periodMonthFactor` (proporcjonalnie do dni). Status: `ok` < 85% ≤ `warn` ≤ 100% < `over`.
- **Wielkość płatności** — granice przedziałów w `settings.amount_buckets` (domyślnie `100, 200, 300, 500`, max 9, sortowane i bez duplikatów), edycja w Ustawienia → Wykresy. `byAmount` zwraca `{ id, label, min, max, amount, count }`, a front filtruje przez `bucketQuery(bucket)`.
- **Oś czasu w Statystykach** — `autoGranularity`: 30 dni / miesiąc / 90 dni → dzień, cały okres → miesiąc, własny: ≤92 dni dzień, ≤365 tydzień, więcej miesiąc; ręczny przełącznik Dzień/Tydzień/Miesiąc. Dane z `byDayCategory`, kubełki z `buildBuckets` (`src/period.ts`), model wykresu w `pages/stats/useTrendChart.ts`.
- Filtr `category` w API przyjmuje kilka nazw po przecinku (multi-select na Przeglądzie: Ctrl+klik).
- AI (`src/modules/ai/`): OpenAI i „Inny” przez `/chat/completions`, Gemini (`generateContent`), Claude (`/messages`); JSON mode:
  - lista modeli z API dostawcy (`POST /ai/models`) — Ustawienia → AI pokazuje dropdown; nieaktualny zapisany model (np. wycofany `gemini-2.0-flash`) jest podmieniany na aktualny (`gemini-3.8-flash` albo pierwszy flash z listy); gdy lista nie wróci (np. „Inny”), zostaje pole tekstowe;
  - kategoryzacja bierze tylko płatności z „Inne”, grupuje je po pośredniku i zapisuje wynik jako **reguły**, więc przyszłe importy łapią się bez AI;
  - ocena okresu to 4 krótkie odpowiedzi po polsku o bieżącym widoku (okres + filtry): główny wydatek, na co poszło najwięcej poza stałymi (rachunki/czynsz), co da się uciąć, czego nie widać na pierwszy rzut oka; ton rzeczowy, konkretne nazwy i kwoty, bez coachingu.

## API (wszystko pod `/api`)

| Endpoint | Co robi |
| --- | --- |
| `GET /meta[?account]` | zakres dat, liczniki (`uncategorized`, `excluded`), kategorie, limity, reguły, `hasAiKey`, `accounts`, `banks`, `amountThresholds` |
| `GET /transactions`, `GET /stats`, `GET /insights` | wspólne filtry: `from, to, category, q, minAmount, maxAmount, kind=all\|expense\|income, sort, account, includeExcluded, excludedOnly, weekday` (`weekday` = dzień jak w JS: 0 niedziela … 6 sobota, po `date`). `insights` = top odbiorcy, największe wydatki, płatności cykliczne (z całej historii), statystyki dzienne |
| `PATCH /transactions/:id` | `{ category, onlyThis, force }` i/lub `{ comment }` i/lub `{ excluded }` |
| `POST/PATCH/DELETE /categories`, `PUT /category-limits` | CRUD kategorii i limitów |
| `GET/POST /rules`, `DELETE /rules/:id` | reguły fraz |
| `GET/POST /accounts`, `PATCH/DELETE /accounts/:id` | konta |
| `GET/PUT /settings/amount-buckets` | `{ thresholds }` |
| `PUT /recurring` | `{ key, status: auto\|active\|ended\|hidden }` — ręczny status płatności cyklicznej |
| `POST /import` (multipart `file`, `account=auto\|new\|<id>`, `accountName`, `bank`, `replaceCsv=1`, `ai=1`), `POST /import/demo` (konto testowe), `DELETE /data[?all=1]` | import i czyszczenie; `all=1` to pełny reset (wbudowane kategorie wracają, własne znikają, klucz AI zostaje); `auto` łączy po IBAN, potem po banku, inaczej tworzy konto |
| `POST /ai/key` (`provider`, `apiKey`, `model`, `baseUrl`), `POST /ai/models`, `POST /ai/categorize`, `GET /ai/evaluations`, `POST /ai/evaluate` | AI |
| `POST /shutdown` | tylko desktop (exe / `Wydatki.cmd`): wyłącza serwer — przycisk „Zamknij aplikację” |
| `GET /bank/status` | `{ gocardless, enablebanking: { hasKeys, appId, redirectUrl, sessions }, accounts }` |
| `/bank/gocardless/*` | `secrets`, `institutions`, `connect`, `sync` |
| `/bank/enablebanking/*` | `keys`, `aspsps`, `connect`, `callback`, `sync` |

Front woła API wyłącznie przez `src/api.ts`. Kształty danych (i odpowiedzi API) są w jednym miejscu: `src/modules/shared/types.ts` — używa ich serwer i front (`src/types.ts` tylko je re-eksportuje). Serwer sprawdza zgodność typami zwracanymi przez serwisy (`Meta`, `ImportResult`…).

## Ekrany

Sidebar: przełącznik konta (od 2 kont), potem dwie grupy: **Analiza** (Przegląd, Statystyki, Płatności, Kategorie) i **Dane** (Import, Ustawienia). Nawigacja: `navigate(page, settingsTab?)` z `useApp()` (typ `Navigate` z `app/navigation.ts`) — tak linkuj np. „Ustaw klucz AI” → `("settings", "ai")`. Id strony kategorii zostaje `limits`.

- **Przegląd** (`pages/dashboard/`: `Dashboard` + `HeroSummary`, `CategoryChartCard`, `MiniCharts`, `NoDataYet`) — domyślnie ostatni miesiąc z danymi. Układ `dash-grid`: lewa kolumna (karta `hero`: KPI + porównanie do poprzedniego porównywalnego okresu, obok wykres kategorii słupki/kołowy — tam też widać przekroczone limity; pod nimi na całą szerokość karty ocena AI `.hero-ai` — 4 sekcje w 2 kolumnach, w 4 na szerokim ekranie, każda ucięta do 4 linii, całość w „Czytaj całość”; pod spodem mini-wykresy: dni tygodnia i wielkość płatności — **oba klikalne, filtrują listę** (chip „Piątki” / „100–200 zł”), miesiące). Panelu limitów na Przeglądzie celowo nie ma (jest strona Kategorie). Prawa kolumna to przyklejony **`PaymentPanel`** z listą płatności filtrowaną kliknięciami w wykresy (tam też `ExcludeToggle`).
- **Statystyki** (`pages/stats/`: `Stats` trzyma stan i układ, każda karta w osobnym pliku — `TrendCard`, `DrillPanel`, `LeftoverCard`, `MonthMatrixCard`, `DailyCard`, `CompareCard`, `TopPayeesCard`, `BiggestCard`, `RecurringCard`) — `PeriodBar` z `sticky` (przyklejony u góry przy przewijaniu, klasa `.stuck` dodaje cień; ≤760px wraca do zwykłego). Linie kategorii w czasie (podział dzień/tydzień/miesiąc, „Pokaż ukryte”, ręczna oś Y — „Oś Y do” **ucina** wszystko powyżej przez `clipPath`, przerywana linia u góry sygnalizuje ucięcie). „Szczegóły okresu” (`.insight-grid`) to flex-wrap: karty rosną, żeby nie zostawało puste miejsce; „Gdzie idzie najwięcej” ma `.grow` (2×), „Porównanie” (`.compare`) idzie na koniec, cykliczne (`.wide`) na pełną szerokość. Tooltip stoi w górnym rogu wykresu **po przeciwnej stronie niż kursor** (kursor w lewej połowie → tooltip z prawej i odwrotnie). **Klik w punkt** otwiera pod wykresem `DrillPanel` z płatnościami tej kategorii w tym kubełku; **klik w kategorię w legendzie** izoluje ją i otwiera `DrillPanel` dla całego okresu (`PERIOD_KEY`), drugi klik przywraca wszystko. Dalej: pasek oceny AI, „Ile zostaje”, macierz kategoria × miesiąc (tylko gdy ≥2 miesiące), sekcja „Szczegóły okresu”: dzień po dniu, porównanie z poprzednim okresem, top odbiorcy, największe wydatki, płatności cykliczne (status w `select.status-select`: auto / aktywna / zakończona / to nie cykliczna).
- **Płatności** (`Transactions.tsx`) — pełna tabela: wyszukiwarka (też po komentarzach), segment rodzaju, kategoria, zakres kwot, chip „Nieskategoryzowane”, chip „Ukryte”, przycisk AI (bez klucza: „Ustaw klucz AI, żeby kategoryzować”), sortowanie po nagłówkach, komentarze inline (`CommentNote`), ukrywanie (`ExcludeToggle`).
- **Kategorie** (`Limits.tsx`, id `limits`) — KPI i wykorzystanie limitów w okresie (`CategoryLimits` bez `onSelect`), tabela kategorii (nazwa, wydane, limit miesięczny, wykorzystanie, zmiana nazwy / usunięcie; „Inne” tylko jako domyślna), „Nowa kategoria”, reguły po frazie.
- **Import** (`ImportPage.tsx`) — wybór konta (auto / istniejące / „+ Nowe konto…” w `Modal`) i banku (albo „Rozpoznaj z pliku”), instrukcja „Skąd wziąć plik” dla wybranego banku, demo, czyszczenie.
- **Ustawienia** (`Settings.tsx` + `pages/settings/*Tab.tsx`) — zakładki: AI (dostawca: OpenAI / Gemini / Claude / Inny, klucz, lista modeli z API albo pole tekstowe, kategoryzacja), Konta, Połączenie z bankiem (Enable Banking / GoCardless), Wykresy (przedziały kwot), Aplikacja („Gdzie są moje dane”, w desktopie „Zamknij aplikację”, w `local`/`desktop` przełącznik „Tryb pokazowy”, pełny reset: płatności, konta, własne kategorie, reguły, limity; wracają wbudowane kategorie, także usunięte).
- Okna dialogowe: `Modal.tsx` (natywny `<dialog>`, fokus na pierwsze pole) i `ConfirmDialog` do potwierdzeń (reset aplikacji). Nie używaj `window.prompt`; `window.confirm` tylko gdy nie ma jeszcze okna z aplikacji.
- `PeriodBar` jest nagłówkiem każdej strony analizy: eyebrow z nazwą strony, strzałki ‹ › (także klawisze ←/→) przesuwające okres o jego długość, tytuł otwierający picker miesięcy, „Ten miesiąc” przy tytule (gdy jesteśmy w innym okresie), segment Ten miesiąc / 30 dni / 90 dni / Cały okres / Własny (duplikat „Ten miesiąc” jest celowy — na prośbę użytkownika). Prop `sticky` przykleja go do góry strony.

## Design system („nowy design”, commit `3c05d51`)

Jasny, spokojny, „fintech/dashboard” — biała karta na szarym tle, granatowy akcent, złoto tylko w logo. Style w `src/styles/*.css` (jeden plik na sekcję, nagłówek `/* ---------- Nazwa ---------- */`); `src/index.css` to tylko `@import` w kolejności kaskady — nowy plik dopisz w odpowiednim miejscu listy, `responsive.css` zostaje ostatni. Tokeny w `styles/tokens.css`.

**Tokeny (`:root`) — używaj ich, nie wpisuj kolorów na sztywno:**

- Tło/powierzchnie: `--bg #f5f6f8`, `--surface #fff`, `--surface-2`, `--surface-3`; linie `--line`, `--line-soft`, `--line-strong`.
- Tekst: `--ink #101828`, `--ink-2`, `--muted #667085`, `--faint`.
- Akcent: `--accent #1d3f73` (+ `-hover`, `-soft`, `-soft-2`), `--focus`; `--gold #f5c518` (logo).
- Semantyka: `--income` zielony, `--expense` czerwony, `--warn` bursztyn, `--ai #6941c6` fiolet — każdy z wariantem `-soft` na tła.
- `--radius 14px`, `--radius-sm 9px`, cienie `--shadow-sm/md/lg`, odstępy strony `--pad-y/--pad-x`.
- Font: **Inter** (pliki `woff2` w paczce, `styles/fonts.css` — działa offline), bazowo 15px; kwoty w tabelach `tabular-nums` (klasa `.num`).

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

## Tryby uruchomienia: lokalny, exe, w przeglądarce, Android

- **Baza.** `Database` (`src/modules/core/Database.ts`, bez Node) dostaje funkcję otwierającą połączenie (`SqlConnection`: `prepare().all/get/run`, `exec` — podzbiór `node:sqlite`) i przy pierwszym użyciu robi schemat i migracje. Serwer (`app/Container.ts`) otwiera `data/wydatki.db` przez `node:sqlite`, wersja w przeglądarce bazę `sql.js`. Repozytoria pytają przez `this.db` (getter na `connection`) — nie trzymaj referencji do połączenia w polach ani zmiennych modułu.
- **Wersja w przeglądarce (`npm run build:web` → `dist-web/`)** — zamiast dawnego trybu online z serwerem: statyczne pliki (np. GitHub Pages, `base: "./"`), **bez backendu**, więc dane użytkownika fizycznie nie mają dokąd trafić. `src/web/`: `browserDatabase.ts` (sql.js + zapis całej bazy do IndexedDB `wydatki` po każdej udanej zmianie), `LocalRouter.ts` (namiastka Express `Router`, na której rejestrują się te same kontrolery), `localServer.ts` (`localFetch` — `src/api.ts` woła go zamiast `fetch`, gdy `import.meta.env.MODE === "web"`; dynamiczny import, więc sql.js nie trafia do paczki desktopowej). Wspólny composition root bez Node: `app/Modules.ts` (wszystko poza bankiem; upload przez wstrzyknięty middleware — na serwerze `multer`, w przeglądarce plik z `FormData`). Środowisko: `core/AppEnvironment.ts` (`appInfo()`, `env()`; serwer = `Runtime`, przeglądarka = stała bez `.env`). Bez połączenia z bankiem (trasy `/bank/*` → 404, zakładka pokazuje „działa tylko w aplikacji”). Jedyny ruch na zewnątrz: AI prosto z przeglądarki do dostawcy z kluczem użytkownika (Claude wymaga nagłówka `anthropic-dangerous-direct-browser-access`). Kod w `src/modules/` (poza `core/Runtime.ts`, `app/Container|Application|main.ts`, `banking/`) nie może importować `node:*` ani używać `Buffer` — id płatności liczy `shared/sha256.ts` (identyczne z `node:crypto`).
- **`meta.app.mode`** (`AppMode`): `local` (npm run dev/start), `desktop` (exe / `Wydatki.cmd`), `web` (GitHub Pages), `android` (Play). Front decyduje tylko po nim: pobieranie, bank (`local`/`desktop`), zamykanie (`desktop`), treść okna powitalnego. `web`/`android` wybiera `localServer.ts` z `import.meta.env.MODE`.
- **Android** — Capacitor (`capacitor.config.json`, appId `io.github.pmierzwinski.wydatki` — po pierwszym wydaniu w Play nie da się go zmienić; `webDir: dist-android`), projekt Gradle w `android/` (wygenerowany przez `cap add android`; `assets/public` jest w jego `.gitignore`, wypełnia go `cap sync`). Ten sam kod co wersja w przeglądarce (sql.js + IndexedDB w WebView), bez przycisku pobierania i bez banku (plan: natywne HTTP z Capacitora, podpis JWT przez WebCrypto, powrót z banku przez App Link). ≤760px tabela Płatności zamienia się w karty (`responsive.css`).
- **Okno powitalne** (`WelcomeDialog`, wszędzie, raz — `localStorage` `wydatki.welcome-seen`; ponownie z Ustawienia → Aplikacja → „Gdzie są moje dane”): gdzie są zapisane dane (zależnie od `mode`) i które akcje coś wysyłają (AI z własnym kluczem, bank tylko w `local`/`desktop`).
- **Tryb pokazowy** (`src/app/showcase.ts`) — przycisk „Pobierz aplikację” (sidebar, Ustawienia → Aplikacja, pusty Przegląd, stopka okna powitalnego). W `web` zawsze, w `android` nigdy, w `local`/`desktop` przełącznik w Ustawienia → Aplikacja (`wydatki.showcase`, włączenie pokazuje okno od nowa).
- **Exe (`npm run package:win`)** — `scripts/package-win.mjs`: vite build → esbuild `src/modules/app/main.ts` do CJS (`import.meta.url` podmienione) → blob Node SEA → kopia `node.exe` jako `Wydatki.exe` + postject → `dist/` + `CZYTAJ.txt` → zip przez `tar.exe`. Wynik w `release/` (w `.gitignore`). `packaged` = `node:sea` `isSea()`; wtedy `appRoot` = folder exe (tam `data/`, `dist/`, `.env`), serwer słucha na `127.0.0.1`, otwiera przeglądarkę (`WYDATKI_NO_BROWSER=1` wyłącza — do testów), przy zajętym porcie sprawdza `/api/health` (`app: "wydatki"`): nasza instancja → tylko otwiera przeglądarkę, obca → kolejny port (do 10). Exe nie jest podpisane (SmartScreen) i ma ikonę Node.
- **`Wydatki.cmd`** — dwuklik z zipa GitHuba (kod źródłowy). Sprawdza Node 22, przy pierwszym starcie robi `npm install` i `npm run build`, potem startuje serwer z `WYDATKI_DESKTOP=1` (to samo zachowanie co exe: 127.0.0.1, przeglądarka, folder `data/` obok skryptu).
- **Pobieranie** — `GET /download/Wydatki-Windows.zip` serwuje plik z `release/` (w `npm run dev` Vite proxy `/download` → API). `meta.app.downloadUrl` = `DOWNLOAD_URL`, lokalny zip albo GitHub Releases (`RELEASE_DOWNLOAD_URL`, w wersji w przeglądarce zawsze ten). `DownloadButton` widać tylko w trybie pokazowym (i w zakładce banku wersji `web`).
- **Zamykanie (desktop)** — `mode === "desktop"` pokazuje `ShutdownButton` (sidebar + Ustawienia → Aplikacja) → `POST /api/shutdown` → `process.exit(0)`, okno konsoli znika, karta pokazuje „Aplikacja zamknięta”.

## Architektura kodu

**`src/modules/shared/`** — kod używany przez serwer i front (bez `node:`, bez `import.meta`, importy z `.ts`): `types.ts` (wszystkie kształty danych i odpowiedzi API), `domain.ts` (`DEFAULT_CATEGORY`, `BUILTIN_CATEGORIES`, `compareRecurring`, `limitStatus`, przedziały kwot `amountBucketDefs`/`bucketQuery`, `suggestPattern`, `merchantPattern`, `payeeLabel`, `evaluationKey`), `ai.ts` (dostawcy, `preferAiModel`, sekcje oceny), `dates.ts`, `numbers.ts` (`round2`, `parseDecimal`). Reguła wymyślona raz ma żyć tutaj, a nie w dwóch kopiach.

**Serwer — `src/modules/<moduł>/`, obiektowo** (klasy; pola prywatne `#x` przypisywane w konstruktorze, bo `erasableSyntaxOnly` zabrania parameter properties):
- **Warstwy w module:** `XxxRepository` (dziedziczy po `core/Repository`: `all`/`one`/`run`/`exec`/`transaction`, tylko SQL i mapowanie wierszy) → `XxxService` (logika domenowa, walidacja, komunikaty po polsku) → `XxxController` (dziedziczy po `core/Controller`; `register(router)` + `this.handle("Komunikat awaryjny", (req) => wynik)` — zwrócona wartość idzie jako JSON, `throw new Error("Po polsku…")` daje 400 `{ error }`). Filtry z query/body zawsze przez `RequestReader.filters`, pola body przez `RequestReader.text()`/`typed()`. Logika nie siedzi w kontrolerach.
- **`core/`** — `AppEnvironment` (interfejs bez Node: `appInfo()`, `env(key)`; `DOWNLOAD_FILE`, `RELEASE_DOWNLOAD_URL`), `Runtime` (serwer: appRoot, packaged/desktop, `.env`, porty i adresy: `publicUrl`, `apiUrl`, `frontendUrl()`, `downloadUrl()`), `Database` (`SqlConnection`, `register(...schemas)`, `transaction(fn)`, migracje), `Repository` + `SqlWhere` (warunek z parametrami, `forAccount`), `Controller` + `RequestReader`.
- **Schematy:** każdy moduł ma `schema.ts` (`ModuleSchema`: `tables`, `columns`, `afterColumns`, `migrations`). `Database` przy otwarciu bazy tworzy najpierw tabele wszystkich modułów, potem kolumny, potem migracje (`Migration { key; run() }`, jednorazowe z flagą w `settings`) w kolejności rejestracji w `Modules`: settings → transactions (`migration.value_date`) → categories (`migration.skip_flag`) → accounts (`migration.accounts`) → ai.
- **Wzorce:** kategoryzacja to łańcuch (`categories/categorizer/Categorizer.ts`: `ChainCategorizer` z `UserRuleMatcher` → `BuiltinRegexMatcher` → `TransferMatcher`; interfejs `Categorizer.categorize(tx)`, `RuleService.categorizer()` buduj raz na partię); formaty CSV to strategie (`importer/csv/formats.ts`: `PkoFormat`, `ColumnProfileFormat`, `SantanderHeaderlessFormat`; fasada `CsvStatementParser`); dostawcy AI to strategie z fabryką (`ai/providers.ts`: `OpenAiProvider`, `GeminiProvider`, `AnthropicProvider`, `AiProviderFactory`; `AiClient` wybiera według `AiSettings`); Open Banking to strategie `BankProvider` (`EnableBankingProvider`, `GoCardlessProvider`; zapis przez `BankingService.sync`). `TransactionFactory` (`create`, `hashId`, `utcDay`) buduje każdą nową płatność (CSV, banki, demo).
- **`app/`** — `Modules` (wspólny composition root serwera i przeglądarki: tworzy repozytoria, serwisy i kontrolery raz i wstrzykuje zależności przez konstruktory — nowy serwis/kontroler dopisz tutaj), `Container` (serwer: plik bazy, `multer`, bank), `Application` (Express: CORS, `/download`, `/api/health`, `/api/shutdown` w desktopie, kontrolery, `dist/`), `MetaService` + `AppController` (`/meta`), `main.ts` (punkt wejścia: port, przeglądarka w exe).

**Front:**
- `app/AppContext.tsx` + `useApp()` — `meta` (odpowiedź `/api/meta`: konta, banki, kategorie, limity, reguły, liczniki, klucz AI, progi, tryb aplikacji), `refreshMeta()`, `account`/`chooseAccount`, `reloadPage()`, `navigate`. `App` pobiera świeże `/meta` przy każdej zmianie strony/konta i montuje stronę dopiero po nim, więc strony czytają dane z kontekstu zamiast pobierać `/meta` same. Po zmianie, która wpływa na te dane (kategoria, limit, konto, klucz AI…), wołaj `await refreshMeta()`.
- `hooks/`: `useAsync(load, deps, delay?)` (ładowanie z odrzucaniem nieaktualnych odpowiedzi, `reload`, `setData`), `useTransactionList` (lista płatności + updatery), `useTransactionEdits` (kategoria/komentarz/ukrycie: optymistycznie wiersze na miejscu, potem `onSaved` / przy błędzie `onFailed`). Zmiana kategorii (także „od odbiorcy”) i ukrycie zostają na przefiltrowanej liście — kategoria się zmienia, wiersze nie znikają; filtr odświeża listę przy kolejnym kliknięciu. `useAction` (busy + baner ok/błąd + `run(fn, fallback)`), `usePeriod("month" | "all")`, `useComparison` (poprzedni porównywalny okres), `useDismiss`, `useFileDrop`.
- Powiadomienia (`app/notifications.ts`, dzwonek w prawym górnym rogu): krótki toast + lista. Typ `category_changed` po zmianie od odbiorcy; klik otwiera Płatności (opcjonalnie z `q`). „Wyczyść” kasuje listę.
- `components/ui/`: `Notices` (banery ok/błąd, opcjonalnie z zamknięciem), `Segmented`, `CategoryTag`/`Swatch`; oraz `EmptyPeriod`, `NewAccountDialog`/`BankSelect`, `DownloadButton`, `ShutdownButton`, `WelcomeDialog` + `FirstVisitWelcome`, `AccountSwitcher`, `MonthPicker`. Wspólne komunikaty wyników: `src/messages.ts`.

## Mapa plików

```
Wydatki.cmd       dwuklik z zipa GitHuba (Node 22, pierwsze uruchomienie buduje dist/)
src/modules/      serwer (Node) + kod wspólny; tsconfig.json
  shared/         typy i reguły wspólne dla serwera i frontu (types, domain, ai, dates, numbers, sha256)
  core/           AppEnvironment, Runtime, Database, Repository + SqlWhere, Controller + RequestReader
  settings/       SettingsRepository, ChartSettingsService (progi kwot), SettingsController, schema
  transactions/   TransactionFactory, TransactionFilter (filtry → SQL), TransactionRepository,
                  TransactionService (kategoria/komentarz/ukrycie), TransactionsController, schema
  categories/     categorizer/ (Categorizer, builtinRules), CategoryRepository, RuleRepository, LimitRepository,
                  CategoryService, RuleService (reguły, recategorizeAll), BudgetService (limity),
                  CategoriesController, schema
  accounts/       AccountRepository, AccountService (dopasowanie importu, konta z banku), AccountsController, schema
  statistics/     StatsService, InsightsService + RecurringDetector, RecurringOverrides, StatisticsController
  importer/       csv/ (CsvStatementParser, formats, Cells, ColumnProfiles, TransactionDrafter, banks),
                  demo/DemoGenerator, ImportService (CSV + konto testowe), DataResetService, ImporterController,
                  fixtures/pko-sample.csv (do testów parsera i snapshotu)
  banking/        BankProvider, EnableBankingProvider, GoCardlessProvider, ProviderHttp, BankingService, BankingController
  ai/             providers (strategie + fabryka), AiSettings, AiClient, AiCategorizationService,
                  PeriodEvaluationService, EvaluationRepository, AiController, schema
  app/            Modules (wspólne), Container (serwer), Application, MetaService, AppController, main.ts
src/              front (React); tsconfig.app.json (src/modules/ tylko przez importy z shared/)
  main.tsx        render <App />
  app/            App (strony, /meta, konto), AppContext (useApp), navigation (Page, NAV_GROUPS, callback banku)
  api.ts          klient API (w wersji web/android → web/localServer)
  web/            wersja w przeglądarce: browserDatabase (sql.js + IndexedDB), LocalRouter, localServer
  types.ts        re-eksport src/modules/shared/types.ts
  format.ts       formatowanie kwot, dat, nazw
  period.ts       okresy i kubełki osi czasu
  colors.ts       kolory kategorii
  messages.ts     wspólne komunikaty wyników
  hooks/          useAsync, useAction, usePeriod, useComparison, useTransactionList, useTransactionEdits, …
  styles/         design system (tokens, base, …, responsive), importowany przez index.css
  components/     Layout, AccountSwitcher, PeriodBar, MonthPicker, PaymentPanel, CategorySelect, CommentNote,
                  CategoryLimits, AiEvaluationCard, Icon, Modal, ConfirmDialog, NotificationCenter, NewCategoryDialog,
                  NewAccountDialog, EmptyPeriod, ExcludeToggle, DownloadButton; charts/ (wykresy SVG); ui/ (drobne klocki)
  pages/          Transactions, Limits, ImportPage, Settings; dashboard/, stats/, settings/ (zakładki)
android/          projekt Capacitor (Gradle); capacitor.config.json w katalogu głównym
scripts/
  package-win.mjs budowanie Wydatki.exe (Node SEA + postject) i zipa
  api-snapshot.mjs  zrzut/porównanie odpowiedzi API na kopii bazy
```

## Na co uważać

- Nie commituj `data/`, `.env` ani prawdziwych wyciągów (zawierają dane osobowe i numery kont).
- Nie dodawaj ciężkich zależności (chart.js, MUI, router itp.) bez wyraźnej prośby — projekt celowo jest lekki.
- Zmieniając parser CSV, sprawdź go na prawdziwym pliku z danego banku (poproś użytkownika o ścieżkę) i upewnij się, że `payee` nie jest pusty. Dla PKO sprawdź też, że `id` się nie zmieniły (inaczej ponowny import zdubluje historię).
- Testując w przeglądarce Cursora: zrzuty ekranu potrafią być o krok spóźnione względem DOM — weryfikuj stan przez `Runtime.evaluate`. Konta/płatności testowe twórz przez API i usuwaj po teście.
- `README.md` jest krótki i częściowo nieaktualny — źródłem prawdy jest ten plik i kod.
