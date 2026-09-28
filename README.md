# Wydatki

Lokalna aplikacja do analizy wydatków z kont w polskich bankach (PKO BP, mBank, ING, Santander, Pekao, Millennium, Alior, Revolut, Credit Agricole), dla kilku kont naraz.

Aplikacja nie loguje się do bankowości hasłem. Dane trafiają do niej na dwa sposoby:

1. **Import CSV** z bankowości — działa od razu.
2. **Open Banking** przez Enable Banking (albo GoCardless dla istniejących kont) — logujesz się na stronie banku, aplikacja pobiera historię.

Dane trzymane są lokalnie w `data/wydatki.db`.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja: [http://localhost:5173](http://localhost:5173)

## Import z banku

1. Zaloguj się do bankowości i otwórz historię rachunku.
2. Wyeksportuj ją do CSV (instrukcja dla wybranego banku jest w zakładce **Import**).
3. Wgraj plik w zakładce **Import**.

Szczegóły architektury, reguły domenowe i konwencje: [AGENTS.md](AGENTS.md).
