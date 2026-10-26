# Wydatki

Lokalna aplikacja do analizy wydatków z kont w polskich bankach (PKO BP, mBank, ING, Santander, Pekao, Millennium, Alior, Revolut, Credit Agricole), dla kilku kont naraz.

Aplikacja nie loguje się do bankowości. Historię wgrywa się jako CSV wyeksportowany z banku.

Dane trzymane są lokalnie w `data/wydatki.json` (stara `data/wydatki.db` jest czytana raz i zostaje jako kopia). Interfejs działa offline (czcionki i strona są w paczce). Internet jest potrzebny tylko do AI, gdy podasz własny klucz.

## Uruchomienie bez konsoli

**Gotowa aplikacja (Windows):** pobierz `Wydatki-Windows.zip` z przycisku w aplikacji albo z [Releases](https://github.com/pmierzwinski/budget-tracker/releases/latest), rozpakuj i kliknij **Wydatki.exe**.

**Kod z GitHuba:** rozpakuj zip repozytorium i kliknij **Wydatki.cmd**. Przy pierwszym starcie doinstaluje zależności i zbuduje interfejs (potrzebny [Node 22](https://nodejs.org)). Potem otworzy przeglądarkę.

Aplikację wyłącza przycisk **Zamknij aplikację** w menu po lewej (albo zamknięcie okna konsoli).

## Wersja w przeglądarce

`npm run build:web` buduje do `dist-web/` statyczną stronę bez serwera (np. na GitHub Pages). Dane zapisują się tylko w przeglądarce (IndexedDB) i nigdzie nie są wysyłane. Jedyne połączenie z internetem to AI, gdy użytkownik sam poda klucz swojego dostawcy. Podgląd: `npm run dev:web`.

## Android (Google Play)

`npm run build:android` buduje tę samą wersję (dane tylko na telefonie) i kopiuje ją do projektu `android/` (Capacitor). `npm run android` otwiera go w Android Studio — stamtąd **Build → Generate Signed App Bundle** daje plik `.aab` do Play Console. Ikonę ustawisz w Android Studio: **res → New → Image Asset**.

## Uruchomienie deweloperskie

```bash
npm install
npm run dev
```

Aplikacja: [http://localhost:5173](http://localhost:5173)

Paczka z `Wydatki.exe`: `npm run package:win` (tylko Windows) → `release/Wydatki-Windows.zip`.

## Import z banku

1. Zaloguj się do bankowości i otwórz historię rachunku.
2. Wyeksportuj ją do CSV (instrukcja dla wybranego banku jest w zakładce **Import**).
3. Wgraj plik w zakładce **Import**.

Szczegóły architektury, reguły domenowe i konwencje: [AGENTS.md](AGENTS.md).
