# Wydatki — kontekst dla agenta

Lokalna aplikacja (jeden użytkownik, jeden komputer) do analizy wydatków z kont w polskich bankach (zaczęło się od **PKO BP**, teraz obsługuje kilka banków i kilka kont naraz). UI i komunikaty są **po polsku** — nowe teksty też pisz po polsku, krótko i konkretnie.

## Podział repo

- `frontend/` — UI (React) **i cała logika aplikacji**: import CSV, kategoryzacja, statystyki, limity, AI, konta. Wejście: `frontend/main.tsx`. Dane to jeden dokument (`shared/store.ts`) trzymany w pamięci przez prostą klasę `Database` (`frontend/db/`), która tylko go czyta i zapisuje.
- `server/` — **mały serwer lokalny** (Windows / `npm run dev`), tylko do tego, czego przeglądarka nie zrobi: plik danych `data/wydatki.json`, „Zamknij aplikację”, serwowanie `dist/`. W web/Android serwera nie ma.
- `shared/` — typy i reguły wspólne frontu i serwera (`types`, `store`, `domain`, `ai`, `dates`, `numbers`, `sha256`).
- `backend/` — jeszcze nie ma. Tak nazwiemy przyszły **zdalny** serwer (tracking, zapis w chmurze). Dziś żadne dane użytkownika nie opuszczają urządzenia poza AI (własny klucz).

## Uruchamianie

```bash
npm install
npm run dev      # serwer :8787 (node --watch) + Vite :5173, proxy /api → 8787
npm run typecheck  # tsc dla server/ + shared/ (tsconfig.json) i frontend/ (tsconfig.app.json)
npm run build    # typecheck + vite build → dist/
npm run build:web  # wersja w przeglądarce (bez serwera, dane w IndexedDB) → dist-web/; podgląd: npm run dev:web
npm run build:android  # to samo z mode "android" → dist-android/ + cap sync; potem npm run android (Android Studio, .aab)
npm start        # sam serwer; jeśli istnieje dist/, serwuje też frontend
npm run package:win  # release/Wydatki-Windows.zip (Wydatki.exe + dist/), tylko na Windows
```

- Node 22+ (serwer czyta starą bazę `data/wydatki.db` przez wbudowany `node:sqlite`, stąd ostrzeżenie „ExperimentalWarning” w logach — to normalne).
- Dane: `data/wydatki.json` (w `.gitignore`), powstaje przy pierwszym zapisie. Dopóki go nie ma, serwer czyta raz starą `data/wydatki.db` (zostaje nietknięta jako kopia).
- Brak testów automatycznych. Logika jest w zwykłych funkcjach na dokumencie (`frontend/modules/*/[a-z]*.ts`), więc da się ją sprawdzić skryptem na kopii danych (bundle esbuildem z `--loader:.css=empty`), a UI — w przeglądarce.
- Serwer to zwykły `node server/main.ts` (wbudowane usuwanie typów w Node 22.18+; `dev:server` = `node --watch` tylko na `server/` i `shared/`, żeby zapis danych nie restartował serwera). Dlatego w TS obowiązuje `erasableSyntaxOnly` — bez `enum`, `namespace`, parameter properties.
- Środowisko użytkownika: Windows + PowerShell (`curl` to alias `Invoke-WebRequest`; używaj `curl.exe` albo `Invoke-RestMethod`).
- `.env` (opcjonalny, ładowany przez `server/Runtime.ts` z `appRoot`): `PORT`, `PUBLIC_URL`, `DOWNLOAD_URL`, `SHOW_DOWNLOAD=1` (przycisk „Pobierz aplikację” na hoście z tym serwerem), a dla AI: `AI_PROVIDER` (`openai` \| `gemini` \| `anthropic` \| `compatible`), `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `AI_MODEL` / `OPENAI_MODEL`, `OPENAI_BASE_URL`. Klucze AI z `.env` front dostaje przez `GET /api/app` jako wartości domyślne; klucz wklejony w UI (Ustawienia → AI) trafia do `settings` w dokumencie i ma pierwszeństwo.

## Stack

- Frontend: React 19 + Vite, **bez routera, bez biblioteki UI, bez bibliotek wykresów**. Wykresy to ręczny SVG/CSS w `frontend/modules/charts/`. Style: globalne w `frontend/styles/`, reszta obok komponentów (patrz „Struktura frontu”). CSV: `papaparse` + `TextDecoder` (UTF-8 / UTF-16 / Windows-1250).
- Serwer: Express 5 + TypeScript (Node 22+ z usuwaniem typów, importy z rozszerzeniem `.ts`), `cors`. Bez bazy SQL — dokument JSON w pliku.
- Nawigacja: stan `page` w `useNavigation`; strony w obiekcie `pages` w `frontend/app/PageManager.tsx` (`pages.link("dashboard")`).

## Skąd dane z banków

API PSD2 banków jest tylko dla licencjonowanych pośredników (AISP) — bank nie wyda „klucza API” osobie prywatnej, więc aplikacja **nie loguje się do bankowości**. Ścieżki:

1. **Import CSV** (główna). `frontend/modules/import/csv/` — `parseStatement(bytes, { bank?, categorize })` → `{ bank, iban, items }` (bez konta — przypisuje je `importFile` przez `resolveImport` z `modules/accounts`); lista `BANKS` w `csv/banks.ts` (pko, mbank, ing, santander, pekao, millennium, alior, revolut, credit_agricole, generic):
   - kodowanie: UTF-8, a przy „krzakach” (`³œ¹`…) fallback na Windows-1250; separator `,`/`;`/tab wykrywany; bank wykrywany z nagłówków (`detectBank`), chyba że użytkownik wybierze go ręcznie; nagłówki normalizowane (bez polskich znaków, małe litery), każdy bank ma profil kolumn;
   - **PKO**: nagłówek `"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","","",…` — **szczegóły opisu leżą w kolejnych, bezimiennych kolumnach** (`Tytuł:`, `Lokalizacja: Adres: … Miasto: … Kraj: …`, `Nazwa odbiorcy:`, `Nazwa nadawcy:`). Parser skleja je w `description` i wyciąga `payee`/`title`; `id` są identyczne jak w dawnym `pko-csv.ts` (sprawdzone na `scripts/fixtures/pko-sample.csv`), więc stare importy nie dublują się;
   - wiersze `Blokada` / statusy oczekujące są pomijane; kolumny obciążenia/uznania są scalane w `amount`; Revolut dolicza opłatę;
   - **tylko PKO jest sprawdzony na prawdziwym pliku.** Profile mBank/ING/Santander/Pekao/Millennium/Alior/Revolut/Credit Agricole są zrobione wg znanych formatów eksportu — przy pierwszym prawdziwym pliku z danego banku zweryfikuj `payee`/daty/kwoty;
   - `date` = **data waluty** (księgowania), `bookingDate` = data operacji (tak, nazwy są odwrócone względem intuicji — historyczna migracja `value_date`);
   - `id` to hash pól (`TransactionDrafter` w `csv/parse.ts`, `hashId` z `shared/sha256.ts`); identyczne wiersze w jednym pliku dostają sufiks, więc nie giną; ponowny import tego samego pliku pomija duplikaty (`insertTransactions`). Profile kolumn i wykrywanie banku: `csv/ColumnProfiles.ts`, formaty (PKO, profil kolumn, Santander bez nagłówków): `csv/formats.ts`, parsowanie komórek (kodowanie, kwoty, daty): `csv/Cells.ts`.
2. **Połączenia z bankiem nie ma.** Historia wchodzi tylko przez import CSV. Płatności pobrane wcześniej przez GoCardless albo Enable Banking zostają w dokumencie (`source`: `gocardless` | `enablebanking`) i da się je normalnie oglądać.

## Model danych (jeden dokument JSON)

Cały stan to `Store` z `shared/store.ts` — na komputerze plik `data/wydatki.json` (przez `GET/PUT /api/store`), w web/Android IndexedDB `wydatki` → `files` → `document`. Zapis = cały dokument po każdej zmianie.

- `transactions` — `amount` ujemne = wydatek, dodatnie = przychód; `category` (pusta traktowana jak „Inne”), `comment` (max 80 znaków), `excluded` („ukryta w statystykach”), `manualCategory` (kategoria ustawiona ręcznie na tej płatności — reguły ją omijają, chyba że `force`), `accountId`, `source`: `csv | gocardless | enablebanking | demo`.
- `accounts` — `id, name, bank, iban, provider ('' | gocardless | enablebanking), externalId, createdAt`. Każda transakcja należy do konta; liczniki i zakresy dat liczy `listAccounts`. Usunięcie konta kasuje jego transakcje. Kategorie, reguły i limity są **wspólne** dla wszystkich kont.
- `rules` — fraza → kategoria (dopasowanie `includes`, bez wielkości liter). Pierwsza pasująca reguła użytkownika (najnowsze pierwsze) wygrywa, potem wbudowane regexy z `modules/categories/builtinRules.ts`.
- `customCategories`, `hiddenCategories` (usunięte/przemianowane **wbudowane** kategorie — ich trafienia z regexów lądują w „Inne”), `limits` (limit miesięczny), `evaluations` (zapisane oceny AI, klucz = zakres + filtry + konto), `notes` (opisy okresów: miesiąc = pierwszy i ostatni dzień, własny zakres = daty od–do; widok pokazuje notatki nachodzące na wybrany okres), `settings` (klucz AI i model, `amount_buckets`, `recurring_overrides`).
- Migracji już nie ma: stara baza była zmigrowana (m.in. dawna kategoria „Poza statystykami” → `excluded`, konto „PKO BP” dla starych płatności) i `server/store.ts` tylko przepisuje jej tabele na dokument. Kopia sprzed tamtych migracji: `data/wydatki.backup-2026-09-27.db`. Nowe pole w dokumencie = nowe pole w `Store` + wartość domyślna w `emptyStore()` (`Database.load` uzupełnia brakujące pola).

## Reguły domenowe, których łatwo nie zauważyć

- **„Inne”** (`DEFAULT_CATEGORY`) = nieskategoryzowane. Nie da się jej usunąć ani przemianować; zawsze jest ostatnia na liście. Pozostałe kategorie (wbudowane i własne) usuwa się i przemianowuje tak samo: płatności, reguły i limit idą do nowej nazwy albo do „Inne”. Usunięta/przemianowana wbudowana ląduje w `hiddenCategories`, żeby wbudowane regexy nie przywracały jej same. Pełny reset (`clearData(draft, true)`) czyści `hiddenCategories` i `customCategories` — wracają tylko wbudowane.
- **Ukryte płatności** (`excluded`) — to **flaga płatności, nie kategoria** (kategoria zostaje oryginalna). Ukryta płatność nie liczy się do wydatków/przychodów w KPI, wykresów, `byCategory`, limitów ani insights, ale **liczy się** do „Ile zostaje” (`byMonth`). Filtr `includeExcluded` pokazuje je z powrotem (przycisk „Pokaż ukryte” w Statystykach), `excludedOnly` zostawia tylko ukryte (chip „Ukryte” w Płatnościach). Przełącznik to `ExcludeToggle` (ikona oka). Służy do dużych jednorazowych wydatków i przelewów między własnymi kontami.
- **Konto** — aktywne konto wybiera się globalnie w sidebarze (`AccountSwitcher`, widoczny od 2 kont, zapamiętany w `localStorage` `wydatki.account`). Jest w kontekście (`getContext().account`, `useActiveAccount`) i strony podają je do `toFilters(query, account)`; `meta` liczy się dla aktywnego konta, a strony analizy przemontowują się przy jego zmianie (`currentPage.key`, `followsAccount`). Pusty = wszystkie konta.
- **Kategorie liczone są saldem** (wydatki + wpływy w danej kategorii). Przelew przychodzący w kategorii wydatkowej zmniejsza jej wydatki — tak było od początku.
- Zmiana kategorii ma dwa zakresy (`CategorySelect`): lista zmienia **tylko tę płatność** (`onlyThis: true`, flaga `manualCategory`) — taka płatność jest wyjątkiem i reguły jej nie ruszają. Link **„Wszystkie od odbiorcy…”** otwiera `Modal` z kategorią i opcją **„Nadpisz też ręcznie ustawione”** (`force`); bez niej reguła pomija wyjątki. Powstaje/aktualizuje się reguła z `suggestPattern(payee)`. Wiersze zostają na przefiltrowanej liście (zmienia się tylko kategoria); znikną po kolejnym przeładowaniu filtra. Wynik ląduje w powiadomieniach (`category_changed`). W UI mówimy „odbiorca”, nie „pośrednik”.
- **Płatności cykliczne** (`detectRecurring` w `modules/statistics/stats.ts`): ten sam odbiorca (klucz = `suggestPattern(...).toLowerCase()`) w ≥3 miesiącach, podobna kwota. Auto-status: „aktywna”, gdy ostatnia płatność jest w ostatnim lub przedostatnim miesiącu danych. Użytkownik nadpisuje status (`auto | active | ended | hidden`) przez `setRecurringStatus` → `settings.recurring_overrides` (JSON klucz → status). Kolejność (`RECURRING_ORDER` w `shared/domain.ts`): nowe/nieprzejrzane (`auto`) na górze, potem ręcznie aktywne, zakończone, a `hidden` („to nie cykliczna”) na samym dole — **nie znikają**, są tylko wyszarzone (samo wykrycie jest informacją).
- **Konto testowe** — `importDemo(database, { uncategorized? })` (`modules/import/importer.ts`; płatności generuje `demo.ts`) tworzy ~6 miesięcy przykładowych płatności kończących się dziś na koncie „Konto testowe” albo — z `uncategorized` — „Konto testowe bez kategorii” (wszystko w „Inne”, do testowania reguł/AI); bank `generic`, `source = demo`. Ponowne wywołanie usuwa to konto (po nazwie) i tworzy od nowa. Przyciski: Import („Dodaj konto testowe” / „Dodaj bez kategorii”) i Ustawienia → Konta (okno z wyborem wariantu). Kategorie/reguły są wspólne, więc reguły tworzone na koncie testowym działają też na prawdziwych danych.
- Usunięcie reguły uruchamia `recategorizeAll` (przelicza wszystko od nowa, z pominięciem ręcznie ustawionych).
- Limity są miesięczne; dla dowolnego zakresu dat są skalowane przez `periodMonthFactor` (proporcjonalnie do dni). Status: `ok` < 85% ≤ `warn` ≤ 100% < `over`.
- **Wielkość płatności** — granice przedziałów w `settings.amount_buckets` (domyślnie `100, 200, 300, 500`, max 9, sortowane i bez duplikatów), edycja w Ustawienia → Wykresy. `byAmount` zwraca `{ id, label, min, max, amount, count }`, a front filtruje przez `bucketQuery(bucket)`.
- **Oś czasu w Statystykach** — `autoGranularity`: 30 dni / miesiąc / 90 dni → dzień, cały okres → miesiąc, własny: ≤92 dni dzień, ≤365 tydzień, więcej miesiąc; ręczny przełącznik Dzień/Tydzień/Miesiąc. Dane z `byDayCategory`, kubełki z `buildBuckets` (`modules/period/period.ts`), model wykresu w `modules/statistics/useTrendChart.ts`.
- Filtr `category` przyjmuje kilka nazw po przecinku (multi-select na Przeglądzie: Ctrl+klik); szukanie (`q`) obejmuje też komentarze i nie zważa na wielkość liter.
- AI (`frontend/modules/ai/`, prosto z przeglądarki do dostawcy): OpenAI i „Inny” przez `/chat/completions`, Gemini (`generateContent`), Claude (`/messages`); JSON mode:
  - lista modeli z API dostawcy (`listAiModels`) — Ustawienia → AI pokazuje dropdown; nieaktualny zapisany model (np. wycofany `gemini-2.0-flash`) jest podmieniany na aktualny (`gemini-3.8-flash` albo pierwszy flash z listy); gdy lista nie wróci (np. „Inny”), zostaje pole tekstowe;
  - kategoryzacja bierze tylko płatności z „Inne”, grupuje je po pośredniku i zapisuje wynik jako **reguły**, więc przyszłe importy łapią się bez AI;
  - ocena okresu to 4 krótkie odpowiedzi po polsku o bieżącym widoku (okres + filtry): główny wydatek, na co poszło najwięcej poza stałymi (rachunki/czynsz), co da się uciąć, czego nie widać na pierwszy rzut oka; ton rzeczowy, konkretne nazwy i kwoty, bez coachingu.

## API serwera lokalnego (tylko komputer)

Front woła serwer tylko w dwóch miejscach: `db/FileDatabase.ts` (dane) i `platform/environment.ts` (tryb + `.env`). Kształty danych są w `shared/types.ts`.

| Endpoint | Co robi |
| --- | --- |
| `GET /api/health` | `{ ok, app: "wydatki" }` — exe sprawdza nim, czy port zajmuje nasza instancja |
| `GET /api/app` | `{ app: { mode, packaged, downloadUrl, showDownload }, env }` — tryb (`local`/`desktop`), adres pobierania i klucze AI z `.env` |
| `GET/PUT /api/store` | cały dokument (`Store`); GET czyta `data/wydatki.json`, a gdy go nie ma — starą `data/wydatki.db` |
| `POST /api/shutdown` | tylko desktop (exe / `Wydatki.cmd`): wyłącza serwer — przycisk „Zamknij aplikację” |
| `GET /download/Wydatki-Windows.zip` | paczka z `release/` |

## Ekrany

Sidebar: przełącznik konta (od 2 kont), potem dwie grupy: **Analiza** (Przegląd, Statystyki, Płatności, Kategorie) i **Dane** (Import, Ustawienia). Nawigacja: `navigate(page, settingsTab?)` z `getContext()` (typ `Navigate` z `app/PageManager`) — tak linkuj np. „Ustaw klucz AI” → `("settings", "ai")`. Id stron zostały stare (`transactions` = Płatności, `limits` = Kategorie — są zapisane w powiadomieniach w `localStorage`), foldery i komponenty mają nazwy z UI.

- **Przegląd** (`pages/dashboard/`: `DashboardPage` + `HeroSummary`, `CategoryChartCard`, `MiniCharts`, `NoDataYet`) — domyślnie ostatni miesiąc z danymi. Układ `dash-grid`: lewa kolumna (karta `hero`: KPI + porównanie do poprzedniego porównywalnego okresu, obok wykres kategorii słupki/kołowy — tam też widać przekroczone limity; pod nimi na całą szerokość karty ocena AI `.hero-ai` (tylko gdy jest klucz) — 4 sekcje w 2 kolumnach, w 4 na szerokim ekranie, każda ucięta do 4 linii, całość w „Czytaj całość”; pod spodem mini-wykresy: dni tygodnia i wielkość płatności — **oba klikalne, filtrują listę** (chip „Piątki” / „100–200 zł”), miesiące). Panelu limitów na Przeglądzie celowo nie ma (jest strona Kategorie). Prawa kolumna to przyklejony **`PaymentPanel`** z listą płatności filtrowaną kliknięciami w wykresy (tam też `ExcludeToggle`). Pod `PeriodBar` karta `PeriodNotes` („Opis okresu”): nowy opis zapisuje się dla dokładnych dat wybranego okresu, a lista pokazuje notatki nachodzące na ten zakres (tak samo na Statystykach).
- **Statystyki** (`pages/stats/StatsPage.tsx` trzyma stan i układ, karty są w `modules/statistics/` — `TrendCard`, `DrillPanel`, `LeftoverCard`, `MonthMatrixCard`, `DailyCard`, `CompareCard`, `TopPayeesCard`, `BiggestCard`, `RecurringCard`) — `PeriodBar` z `sticky` (przyklejony u góry przy przewijaniu, klasa `.stuck` dodaje cień; ≤760px wraca do zwykłego). Linie kategorii w czasie (podział dzień/tydzień/miesiąc, „Pokaż ukryte”, ręczna oś Y — „Oś Y do” **ucina** wszystko powyżej przez `clipPath`, przerywana linia u góry sygnalizuje ucięcie). „Szczegóły okresu” (`.insight-grid`) to flex-wrap: karty rosną, żeby nie zostawało puste miejsce; „Gdzie idzie najwięcej” ma `.grow` (2×), „Porównanie” (`.compare`) idzie na koniec, cykliczne (`.wide`) na pełną szerokość. Tooltip stoi w górnym rogu wykresu **po przeciwnej stronie niż kursor** (kursor w lewej połowie → tooltip z prawej i odwrotnie). **Klik w punkt** otwiera pod wykresem `DrillPanel` z płatnościami tej kategorii w tym kubełku; **klik w kategorię w legendzie** izoluje ją i otwiera `DrillPanel` dla całego okresu (`PERIOD_KEY`), drugi klik przywraca wszystko. Dalej: pasek oceny AI, „Ile zostaje”, macierz kategoria × miesiąc (tylko gdy ≥2 miesiące), sekcja „Szczegóły okresu”: dzień po dniu, porównanie z poprzednim okresem, top odbiorcy, największe wydatki, płatności cykliczne (status w `select.status-select`: auto / aktywna / zakończona / to nie cykliczna).
- **Płatności** (`pages/payments/PaymentsPage.tsx`) — pełna tabela: wyszukiwarka (też po komentarzach), segment rodzaju, kategoria, zakres kwot, chip „Nieskategoryzowane”, chip „Ukryte”, przycisk AI (tylko gdy jest klucz), sortowanie po nagłówkach, komentarze inline (`CommentNote`), ukrywanie (`ExcludeToggle`).
- **Kategorie** (`pages/categories/CategoriesPage.tsx`, id `limits`) — KPI i wykorzystanie limitów w okresie (`CategoryLimits` bez `onSelect`), tabela kategorii (nazwa, wydane, limit miesięczny, wykorzystanie, zmiana nazwy / usunięcie; „Inne” tylko jako domyślna), „Nowa kategoria”, reguły po frazie.
- **Import** (`pages/import/ImportPage.tsx`) — wybór konta (auto / istniejące / „+ Nowe konto…” w `Modal`) i banku (albo „Rozpoznaj z pliku”), instrukcja „Skąd wziąć plik” dla wybranego banku, demo, czyszczenie.
- **Ustawienia** (`pages/settings/SettingsPage.tsx` + `tabs/*Tab.tsx`; otwarta zakładka jest w `getContext().settingsTab`, bo inne strony otwierają konkretną kartę przez `navigate("settings", "ai")`) — zakładki: AI (dostawca: OpenAI / Gemini / Claude / Inny, klucz, lista modeli z API albo pole tekstowe, kategoryzacja), Konta, Wykresy (przedziały kwot), Aplikacja („Gdzie są moje dane”, w desktopie „Zamknij aplikację”, pełny reset: płatności, konta, własne kategorie, reguły, limity; wracają wbudowane kategorie, także usunięte).
- Okna dialogowe: `ui/Modal.tsx` (natywny `<dialog>`, fokus na pierwsze pole) i `ConfirmDialog` do potwierdzeń (reset aplikacji). Nie używaj `window.prompt`; `window.confirm` tylko gdy nie ma jeszcze okna z aplikacji.
- `PeriodBar` jest nagłówkiem każdej strony analizy: eyebrow z nazwą strony, strzałki ‹ › (także klawisze ←/→) przesuwające okres o jego długość, tytuł otwierający picker miesięcy, „Ten miesiąc” przy tytule (gdy jesteśmy w innym okresie), segment Ten miesiąc / 30 dni / 90 dni / Cały okres / Własny (duplikat „Ten miesiąc” jest celowy — na prośbę użytkownika). Prop `sticky` przykleja go do góry strony. Zmiana okresu najpierw pokazuje „Liczę okres…” (`.period-busy`), a przebudowę strony puszcza w następnej klatce.

## Design system („nowy design”, commit `3c05d51`)

Jasny, spokojny, „fintech/dashboard” — biała karta na szarym tle, granatowy akcent, złoto tylko w logo. Globalne style w `frontend/styles/` (`index.css` = `@import` w kolejności kaskady: fonts, tokens, base, shell, controls, cards, tables, modal, responsive — ten ostatni tylko dla szkieletu aplikacji). Style modułów i stron leżą obok komponentów (nagłówek `/* ---------- Nazwa ---------- */`, reguły dla małych ekranów na końcu pliku w sekcji „Responsive”). Tokeny w `styles/tokens.css`.

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
- AI: `.ai`, `.ai-badge` (fioletowy, ikona `sparkle`), `.ai-dialog` (natywny `<dialog>`). Ocena, kategoryzacja i opcja przy imporcie są w UI tylko gdy jest klucz (`hasAiKey`).
- Tabele: `.table-wrap` (`.flat` wewnątrz karty), `.th-sort`, `.matrix` ze `.sticky-col`, `.compact-table` (+ `tfoot`), `.cell-name`.
- Nowsze: `.modal` / `.modal-body` / `.modal-content`, `.field-hint(.warn)`, `.scope-choice`/`.scope-option`, `.exclude-toggle(.on,.compact)` + wiersze `.excluded`, `.drill-card`/`.drill-list`, `.section-head`, `.insight-grid` (`> .wide`), `.stat-grid`, `.kpi-row`/`.kpi`, `.limit-table`/`.limit-line`, `.account-switch`/`.account-menu`, `.account-list`, `.settings-tabs`, `.provider-switch`, `.copy-field`, `.file-btn`, `.threshold-*`.

**Ikony:** `frontend/ui/Icon.tsx` — ręczne ścieżki SVG 24×24, obrys 1.9, `currentColor`. Nową ikonę dodaj do `PATHS`, nie instaluj paczki ikon.

**Kolory kategorii:** `CATEGORY_COLORS` + `categoryColor(name)` w `modules/categories/colors.ts` (swatch jako komponent: `Swatch` / `CategoryTag` z `modules/categories`) (dla nowych nazw kolor z hasha). Nie mieszaj ich z tokenami semantycznymi.

**Responsywność:** ≤1360px sidebar zwija się do 72px (same ikony), ≤1080px `dash-grid`/`split` przechodzą w jedną kolumnę, a `PaymentPanel` przestaje być sticky, ≤760px sidebar staje się paskiem. Jest `prefers-reduced-motion`.

**Konwencje UI:**

- Formatowanie liczb i dat tylko przez `lib/format.ts` (`money`, `roundMoney`, `compactMoney`, `percent`, `signedPercent`, `formatDay`, `monthLabel`, `txName`…) — `pl-PL`, złotówki. Okresy (presety, przesuwanie, opis, porównanie, kubełki osi czasu): `modules/period/period.ts`.
- Dostępność: `type="button"`, `aria-label` na przyciskach-ikonach, `aria-pressed`/`aria-expanded` na przełącznikach, `:focus-visible` z `--focus`.
- Po zapisie rób optymistyczną aktualizację stanu, a przy błędzie przeładuj dane i pokaż `.banner.error` — dla płatności robi to `useTransactionEdits`, dla akcji w ustawieniach `useAction` (patrz „Architektura kodu”).
- Puste stany zawsze z konkretną akcją (np. „Ostatni miesiąc z danymi”, „Importuj historię”).
- Styl kodu: brak komentarzy opisujących oczywistości, nazwy po angielsku, teksty UI po polsku.

## Tryby uruchomienia: lokalny, exe, w przeglądarce, Android

- **Baza.** `Database` (`frontend/db/Database.ts`) trzyma dokument w pamięci: `data` (odczyt), `update(draft => …)` (zmiana na płytkiej kopii — podmieniaj całe pola, nie mutuj tablic; zapisy idą po kolei), `subscribe` (kontekst przelicza `meta` po każdej zmianie). Podklasy tylko czytają/zapisują: `FileDatabase` (komputer, `/api/store`) i `BrowserDatabase` (web + Android, IndexedDB). Wybór implementacji: `openDatabase()` w `db/index.ts`, wołane raz w `app/App.tsx` — to cały „dependency injection”.
- **Wersja w przeglądarce (`npm run build:web` → `dist-web/`)** — statyczne pliki (np. GitHub Pages, `base: "./"`), **bez backendu**, więc dane użytkownika fizycznie nie mają dokąd trafić. Ten sam kod co na komputerze, tylko `BrowserDatabase`. Jedyny ruch na zewnątrz: AI prosto z przeglądarki do dostawcy z kluczem użytkownika (Claude wymaga nagłówka `anthropic-dangerous-direct-browser-access`). Kod w `frontend/` i `shared/` nie może importować `node:*` ani używać `Buffer` — id płatności liczy `shared/sha256.ts` (identyczne z `node:crypto`).
- **`meta.app.mode`** (`AppMode`): `local` (npm run dev/start), `desktop` (exe / `Wydatki.cmd`), `web` (GitHub Pages), `android` (Play). Na komputerze podaje go serwer (`GET /api/app`), w web/Android `platform/environment.ts` z `import.meta.env.MODE`. Na funkcje zamienia go tylko `frontend/platform/platform.ts` (`platform(app)` / `usePlatform()` → `onDevice`, `shutdown`, `showcase`, `trial`, `phone`); komponenty pytają o funkcję, nie o tryb. Teksty zależne od platformy też są w `platform/` (`DataNote`, `WelcomeDialog`).
- **Android** — Capacitor (`capacitor.config.json`, appId `io.github.pmierzwinski.wydatki` — po pierwszym wydaniu w Play nie da się go zmienić; `webDir: dist-android`), projekt Gradle w `android/` (wygenerowany przez `cap add android`; `assets/public` jest w jego `.gitignore`, wypełnia go `cap sync`). Ten sam kod co wersja w przeglądarce (IndexedDB w WebView), bez przycisku pobierania. ≤760px tabela Płatności zamienia się w karty (`pages/payments/payments-page.css`).
- **Okno powitalne** (`WelcomeDialog`, wszędzie, raz — `localStorage` `wydatki.welcome-seen`; ponownie z Ustawienia → Aplikacja → „Gdzie są moje dane”): gdzie są zapisane dane (zależnie od `mode`) i które akcje coś wysyłają (AI z własnym kluczem). Zaraz potem, raz (`wydatki.categories-setup`), okno kategorii: zostaw wbudowane albo usuń wszystkie i wpisz własne („Inne” zostaje; płatności z usuniętych idą do „Inne”). Ponowne otwarcie z ustawień nie pyta o kategorie drugi raz.
- **Przycisk „Pobierz aplikację”** (sidebar, Ustawienia → Aplikacja, pusty Przegląd, stopka okna powitalnego) — `app.showDownload`. W `web` zawsze, w `android` nigdy. Na serwerze (`local`/`desktop`, też host) włącza go `SHOW_DOWNLOAD=1` w `.env`; adres to `DOWNLOAD_URL`, lokalny zip z `release/` albo GitHub Releases.
- **Exe (`npm run package:win`)** — `scripts/package-win.mjs`: vite build → esbuild `server/main.ts` do CJS (`import.meta.url` podmienione) → blob Node SEA → kopia `node.exe` jako `Wydatki.exe` + postject → `dist/` + `CZYTAJ.txt` → zip przez `tar.exe`. Wynik w `release/` (w `.gitignore`). `packaged` = `node:sea` `isSea()`; wtedy `appRoot` = folder exe (tam `data/`, `dist/`, `.env`), serwer słucha na `127.0.0.1`, otwiera przeglądarkę (`WYDATKI_NO_BROWSER=1` wyłącza — do testów), przy zajętym porcie sprawdza `/api/health` (`app: "wydatki"`): nasza instancja → tylko otwiera przeglądarkę, obca → kolejny port (do 10). Exe nie jest podpisane (SmartScreen) i ma ikonę Node.
- **`Wydatki.cmd`** — dwuklik z zipa GitHuba (kod źródłowy). Sprawdza Node 22, przy pierwszym starcie robi `npm install` i `npm run build`, potem startuje `server/main.ts` z `WYDATKI_DESKTOP=1` (to samo zachowanie co exe: 127.0.0.1, przeglądarka, folder `data/` obok skryptu).
- **Pobieranie** — `GET /download/Wydatki-Windows.zip` serwuje plik z `release/` (w `npm run dev` Vite proxy `/download` → serwer). `meta.app.downloadUrl` = `DOWNLOAD_URL`, lokalny zip albo GitHub Releases (`RELEASE_DOWNLOAD_URL` w `shared/domain.ts`, w wersji w przeglądarce zawsze ten). `DownloadButton` widać, gdy `showDownload` (wersja `web` albo `SHOW_DOWNLOAD=1`).
- **Zamykanie (desktop)** — `usePlatform().shutdown` pokazuje `ShutdownButton` (sidebar + Ustawienia → Aplikacja) → `POST /api/shutdown` → `process.exit(0)`, okno konsoli znika, karta pokazuje „Aplikacja zamknięta”.

## Architektura kodu

**Droga od startu do ekranu:** `main.tsx` renderuje `<App />` → `App` otwiera bazę (`openDatabase()`), `getAppContext(database)` ładuje dokument i `Environment`, liczy `meta` i składa kontekst → `Layout` (sidebar) + `PageManager` (bieżąca strona) → strona składa komponenty z własnego folderu i z `modules/` → komponent czyta `getContext().database.data` przez funkcje modułów i zapisuje przez `database.update(draft => funkcja(draft, …))`.

**`shared/`** — kod używany przez front i serwer (bez `node:`, bez `import.meta`, importy z `.ts`): `types.ts` (kształty danych), `store.ts` (dokument), `domain.ts` (`DEFAULT_CATEGORY`, `BUILTIN_CATEGORIES`, `compareRecurring`, `limitStatus`, przedziały kwot `amountBucketDefs`/`bucketQuery`, `suggestPattern`, `merchantPattern`, `payeeLabel`, `evaluationKey`, adresy pobierania), `ai.ts` (dostawcy, `preferAiModel`, sekcje oceny), `dates.ts`, `numbers.ts` (`round2`, `parseDecimal`), `sha256.ts` (`hashId`). Reguła wymyślona raz ma żyć tutaj albo w module frontu, nie w dwóch kopiach.

**Logika — zwykłe funkcje w `frontend/modules/<moduł>/<nazwa>.ts`** (pliki z małej litery, bez Reacta, bez klas-serwisów):
- odczyt: `(store, filters) → wynik`, np. `computeStats(database.data, toFilters(period, account))`, `listTransactions`, `computeInsights`, `listCategories`, `listAccounts`;
- zapis: `(draft, …) → wynik` wołane w `database.update(...)`, np. `applyCategory`, `upsertRule`, `renameCategory`, `setCategoryLimit`, `createAccount`, `clearData`; błąd walidacji = `throw new Error("Po polsku…")` (banner przez `useAction` / `useTransactionEdits`);
- async z bazą (AI, import pliku, konto testowe): `(database, …)`, np. `importFile(database, env, file, options)`, `categorizeWithAi(database, env)`, `evaluatePeriod`.
- Pliki: `payments/transactions.ts` (filtry `toFilters`/`filterTransactions`, sortowanie, `listTransactions`, edycja płatności, `newTransaction`, `insertTransactions`), `categories/categories.ts` (kategorie, reguły, `categorizer`, `recategorizeAll`, limity, `periodMonthFactor`, `budgets`) + `builtinRules.ts`, `accounts/accounts.ts`, `statistics/stats.ts` (`computeStats`, `computeInsights` + płatności cykliczne, progi kwot), `import/` (`importer.ts`, `demo.ts`, `csv/`), `ai/ai.ts` + `providers.ts` (strategie dostawców z fabryką `AiProviderFactory`), `app/meta.ts` (`computeMeta`).
- Kategoryzacja: `categorizer(store)` zwraca funkcję — reguły użytkownika → wbudowane regexy → „Przelewy” dla przelewów i wpływów → „Inne”; ukryte kategorie lądują w „Inne”. Buduj raz na partię.

**`server/`** (tylko Windows / `npm run dev`) — `main.ts` (Express: trasy z tabeli API, `dist/`, nasłuch i przeglądarka w exe), `Runtime.ts` (appRoot, packaged/desktop, `.env`, porty i adresy: `publicUrl`, `apiUrl`, `frontendUrl()`, `downloadUrl()`), `store.ts` (plik danych).

**Front** — szczegóły w „Struktura frontu” niżej:
- `app/AppContext.tsx` + `getContext()` — `database`, `env` (AI z `.env`), `meta` (liczone z dokumentu dla aktywnego konta: konta, banki, kategorie, limity, reguły, liczniki, klucz AI, progi, tryb aplikacji — **odświeża się samo po każdym `database.update`**), `account`/`chooseAccount`, `reloadPage()` (remount bieżącej strony), `currentPage` (`id`, `key`) / `navigate` / `settingsTab`, powiadomienia, `paymentsSearch`. Klik w powiadomienie obsługuje `NotificationCenter` (nawigacja + opcjonalne `paymentsSearch` na Płatnościach).
- Listy i statystyki na stronach liczy `useAsync(() => funkcja(database.data, …), deps)` — przeliczają się przy zmianie filtrów albo po `reload()`, nie po każdej zmianie danych (dzięki temu wiersz zmieniony na przefiltrowanej liście nie znika od razu).
- Hooki: `lib/useAsync(load, deps, delay?)` (sync albo async, odrzuca nieaktualne wyniki, `reload`, `setData`), `lib/useAction` (busy + baner ok/błąd + `run(fn, fallback)`), `lib/useDismiss`, `lib/useFileDrop`; `modules/payments`: `useTransactionList` (lista płatności + updatery), `useTransactionEdits` (kategoria/komentarz/ukrycie: optymistycznie wiersze na miejscu, potem `onSaved` / przy błędzie `onFailed`). `modules/period`: `usePeriod("month" | "all")`, `useComparison` (poprzedni porównywalny okres).
- Powiadomienia (`modules/notifications`, dzwonek w prawym górnym rogu): krótki toast + lista. Typ `category_changed` po zmianie od odbiorcy; klik otwiera Płatności (opcjonalnie z `q`). „Wyczyść” kasuje listę.
- `ui/`: `Notices` (banery ok/błąd, opcjonalnie z zamknięciem), `Segmented`, `Modal`, `ConfirmDialog`, `Icon`. Wspólne komunikaty wyników: `lib/messages.ts`.

## Struktura frontu (jak czytać kod)

Czytaj jak książkę: `frontend/main.tsx` (spis treści) → `app/App.tsx` (baza, kontekst i layout) → `app/PageManager` (bieżąca strona i lista stron) → `pages/<strona>/<Nazwa>Page.tsx` (składa komponenty) → komponenty strony w tym samym folderze → moduły (`modules/<moduł>/index.ts` mówi, co moduł daje) → logika modułu (`modules/<moduł>/<nazwa>.ts`) → `db/` (zapis).

- `app/` — szkielet: `App` (baza + provider + layout), `PageManager` (bieżąca strona i obiekt `pages`: grupy, `link(id)`; nowa strona = folder w `pages/` + jeden wpis w `pages.groups`), `getAppContext` (jeden obiekt kontekstu), `meta.ts`, `layout/Layout` (sidebar), `AppContext` (`getContext`), `useNavigation`, `useActiveAccount`.
- `db/` — `Database` + `FileDatabase` / `BrowserDatabase` + `openDatabase()`.
- `pages/<strona>/` — jedna strona = jeden folder; plik wejściowy `<Nazwa>Page.tsx` (bez propsów, stan i akcje) + części używane tylko przez tę stronę (np. `import/FileDrop`, `ImportPreviewCard`, `SideCards`; `payments/FilterBar`, `PaymentsTable`; `categories/CategoryRow`, `RulesCard`) + jej CSS.
- `modules/<moduł>/` — funkcje używane przez kilka stron: `period`, `payments`, `statistics`, `charts`, `categories`, `accounts`, `import`, `ai`, `notifications`. `index.ts` = publiczne API modułu (komponenty, hooki i funkcje logiki) i import jego CSS.
- `platform/` — różnice Windows / web / Android (patrz „Tryby uruchomienia”), też `environment.ts`.
- `ui/` — klocki bez wiedzy o domenie; `lib/` — formatowanie, komunikaty, ogólne hooki; `styles/` — globalny design system.

Zasady:
1. Kierunek zależności: `pages` → `modules`, `platform`, `ui`, `lib`, `db` (proste rzeczy strona składa sama z `ui`, większe bierze z `modules`); `modules` → inne moduły, `platform`, `ui`, `lib`, `db`; `ui` i `lib` nie importują nic z `app`/`pages`/`modules`/`platform`. `getContext()` (`app/AppContext`) wolno używać w stronach, modułach i `platform/`. Wszystko może importować `shared/`.
2. Strony, `app/` i `platform/` importują moduł **tylko przez folder** (`../../modules/period`, `../../platform`, `../../db`). Wewnątrz modułu — zwykłe `./plik`. Logika jednego modułu importuje logikę innego bezpośrednio z pliku (`../categories/categories`), żeby nie ciągnąć komponentów i CSS (i żeby dało się ją uruchomić poza przeglądarką).
3. Coś używane przez jedną stronę leży w jej folderze; przez ≥2 strony → `modules/`; bez domeny → `ui/` / `lib/`.
4. CSS leży obok właściciela: moduł importuje go w `index.ts`, strona w `<Nazwa>Page.tsx` (Vite dokłada go każdej stronie, która użyje modułu). Wspólne klasy (`.card`, `.primary`, `.toggle-chip`, `.steps`, `.money-input`…) są w `styles/`. Kaskada: globalne style ładują się pierwsze (`main.tsx`), potem CSS modułów i stron w kolejności importów — nie polegaj na kolejności między dwoma modułami przy tej samej specyficzności.
5. Plik czyta się z góry na dół: najpierw eksportowany komponent, niżej pomocnicze części.

## Mapa plików

```
Wydatki.cmd       dwuklik z zipa GitHuba (Node 22, pierwsze uruchomienie buduje dist/)
index.html        wejście Vite → frontend/main.tsx
shared/           typy i reguły wspólne dla frontu i serwera (types, store, domain, ai, dates, numbers, sha256)
server/           serwer lokalny (Windows / npm run dev); tsconfig.json
  main.ts         Express: /api/health, /api/app, /api/store, /api/shutdown, /download, dist/
  Runtime.ts      appRoot, packaged/desktop, .env, porty i adresy
  store.ts        data/wydatki.json (pierwszy odczyt ze starej data/wydatki.db)
frontend/         React + cała logika; tsconfig.json rozszerza ../tsconfig.app.json (edytor ładuje tylko tsconfig.json)
  main.tsx        START: spis treści, globalne style, render <App />
  app/            App, PageManager, getAppContext, meta, AppContext (getContext), useNavigation, useActiveAccount,
                  layout/Layout (sidebar)
  db/             Database (dokument w pamięci), FileDatabase, BrowserDatabase, openDatabase
  pages/          dashboard/, stats/, payments/, categories/, import/, settings/ (+ tabs/) — <Nazwa>Page.tsx + części + CSS
  modules/        payments/ (transactions.ts, PaymentPanel, CommentNote, ExcludeToggle, useTransactionList, useTransactionEdits)
                  categories/ (categories.ts, builtinRules.ts, CategorySelect, NewCategoryDialog, CategoryLimits, CategoryTag/Swatch, colors)
                  accounts/ (accounts.ts, AccountSwitcher, NewAccountDialog/BankSelect)
                  statistics/ (stats.ts, TrendCard, useTrendChart, DrillPanel, TxMiniList, LeftoverCard, MonthMatrixCard,
                    DailyCard, CompareCard, TopPayeesCard, BiggestCard, RecurringCard)
                  import/ (importer.ts, demo.ts, csv/: parse, formats, Cells, ColumnProfiles, banks)
                  ai/ (ai.ts, providers.ts, AiEvaluationCard), period/ (PeriodBar, MonthPicker, EmptyPeriod, usePeriod,
                    useComparison, period.ts), charts/ (CategoryCharts, Meters, MonthBars, TrendLines — SVG bez bibliotek),
                  notifications/ (NotificationCenter, useNotifications)
  platform/       platform.ts (features), environment.ts, usePlatform, showcase, DataNote, DownloadButton,
                  ShutdownButton, WelcomeDialog
  ui/             Modal, ConfirmDialog, Icon, Notices, Segmented
  lib/            format, messages, useAsync, useAction, useDismiss, useFileDrop
  styles/         globalny design system (fonts, tokens, base, shell, controls, cards, tables, modal, responsive)
  assets/fonts/   Inter woff2
android/          projekt Capacitor (Gradle); capacitor.config.json w katalogu głównym
scripts/
  package-win.mjs budowanie Wydatki.exe (Node SEA + postject) i zipa
  fixtures/pko-sample.csv  przykładowy wyciąg PKO (sprawdzanie parsera i id)
```

## Na co uważać

- Nie commituj `data/`, `.env` ani prawdziwych wyciągów (zawierają dane osobowe i numery kont).
- Nie dodawaj ciężkich zależności (chart.js, MUI, router itp.) bez wyraźnej prośby — projekt celowo jest lekki.
- Zmieniając parser CSV, sprawdź go na prawdziwym pliku z danego banku (poproś użytkownika o ścieżkę) i upewnij się, że `payee` nie jest pusty. Dla PKO sprawdź też, że `id` się nie zmieniły (inaczej ponowny import zdubluje historię).
- Testując w przeglądarce Cursora: zrzuty ekranu potrafią być o krok spóźnione względem DOM — weryfikuj stan przez `Runtime.evaluate`. Testuj na kopii danych: serwer z `WYDATKI_ROOT=<folder z data/>` (kopia `wydatki.db` albo `wydatki.json`), nie na prawdziwym `data/`.
- `README.md` jest krótki i częściowo nieaktualny — źródłem prawdy jest ten plik i kod.
