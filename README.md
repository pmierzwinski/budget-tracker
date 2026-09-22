# Wydatki

Lokalna aplikacja do śledzenia wydatków z historii PKO Banku Polskiego.

Bezpośrednie API PSD2 PKO jest dostępne tylko dla licencjonowanych TPP, więc aplikacja nie loguje się do iPKO hasłem. Działa na dwa sposoby:

1. **Import CSV** z iPKO — działa od razu.
2. **Open Banking** przez GoCardless Bank Account Data — logujesz się na stronie PKO, aplikacja pobiera historię.

Dane trzymane są lokalnie w `data/wydatki.db`.

## Uruchomienie

```bash
npm install
npm run dev
```

Aplikacja: [http://localhost:5173](http://localhost:5173)

## Import z iPKO

1. Zaloguj się do iPKO.
2. Konto → Historia operacji.
3. Pobierz zestawienie jako CSV.
4. Wgraj plik w zakładce **Import**.
