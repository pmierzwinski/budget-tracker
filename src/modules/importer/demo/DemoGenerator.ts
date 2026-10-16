// "Konto testowe": ~6 months of sample payments ending today (seeded, so the same every time on a given day).
import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import { isoDate } from "../../shared/dates.ts";
import { round2 } from "../../shared/numbers.ts";
import type { Transaction } from "../../shared/types.ts";
import type { Categorizer } from "../../categories/categorizer/Categorizer.ts";
import { TransactionFactory } from "../../transactions/TransactionFactory.ts";

type Draft = { date: string; amount: number; type: string; payee: string; title: string; city?: string };

const SHOPS = [
  { payee: "BIEDRONKA 1234", min: 25, max: 160, perMonth: 7 },
  { payee: "LIDL SP. Z O.O.", min: 40, max: 220, perMonth: 4 },
  { payee: "ZABKA Z5521", min: 8, max: 45, perMonth: 6 },
  { payee: "ORLEN STACJA NR 812", min: 150, max: 290, perMonth: 2 },
  { payee: "UBER EATS", min: 45, max: 110, perMonth: 2 },
  { payee: "MCDONALDS 213", min: 25, max: 60, perMonth: 1 },
  { payee: "ROSSMANN 0412", min: 20, max: 120, perMonth: 1 },
  { payee: "APTEKA DOZ", min: 15, max: 90, perMonth: 1 },
  { payee: "BOLT.EU", min: 18, max: 55, perMonth: 2 },
  { payee: "ALLEGRO.PL", min: 40, max: 400, perMonth: 1.5 },
  { payee: "KINO HELIOS", min: 40, max: 80, perMonth: 0.6 },
  { payee: "ZALANDO", min: 120, max: 380, perMonth: 0.4 },
  { payee: "WARSZTAT U ZBYSZKA", min: 90, max: 250, perMonth: 0.3 },
];

const MONTHLY = [
  { day: 10, amount: 8200, type: "Przelew na konto", payee: "FIRMA TESTOWA SP. Z O.O.", title: "WYNAGRODZENIE" },
  { day: 11, amount: -2400, type: "Przelew z rachunku", payee: "WSPÓLNOTA MIESZKANIOWA", title: "CZYNSZ" },
  { day: 12, amount: -189.99, type: "Płatność kartą", payee: "PLAY", title: "ABONAMENT" },
  { day: 14, amount: -60, type: "Płatność kartą", payee: "NETFLIX.COM", title: "" },
  { day: 15, amount: -23.99, type: "Płatność kartą", payee: "SPOTIFY", title: "" },
  { day: 18, amount: -140, type: "Przelew z rachunku", payee: "PGE OBRÓT S.A.", title: "ENERGIA ELEKTRYCZNA" },
  { day: 20, amount: -500, type: "Przelew z rachunku", payee: "XTB S.A.", title: "WPŁATA NA IKE" },
  { day: 25, amount: -129, type: "Płatność kartą", payee: "CITYFIT", title: "KARNET" },
];

const SEED = 20260927;

/** Deterministic linear congruential generator. */
class SeededRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  next(): number {
    this.#state = (this.#state * 1664525 + 1013904223) >>> 0;
    return this.#state / 2 ** 32;
  }
}

export class DemoGenerator {
  /** `uncategorized` puts everything in "Inne" (to try rules and AI). */
  generate(accountId: string, options: { categorizer: Categorizer; months?: number; uncategorized?: boolean }): Transaction[] {
    const random = new SeededRandom(SEED);
    const rand = () => random.next();
    const end = new Date();
    const todayIso = isoDate(end);
    const months = options.months || 6;
    const drafts: Draft[] = [];
    for (let back = months - 1; back >= 0; back -= 1) {
      const year = end.getFullYear();
      const month = end.getMonth() - back;
      const days = new Date(year, month + 1, 0).getDate();
      const at = (day: number) => isoDate(new Date(year, month, Math.min(day, days)));
      for (const row of MONTHLY) {
        if (row.payee === "CITYFIT" && back < 2) continue;
        const amount = row.payee.startsWith("PGE") ? -Math.round(110 + rand() * 70) : row.amount;
        drafts.push({ date: at(row.day), amount, type: row.type, payee: row.payee, title: row.title });
      }
      for (const shop of SHOPS) {
        const count = Math.floor(shop.perMonth + rand());
        for (let i = 0; i < count; i += 1) {
          const amount = -round2(shop.min + rand() * (shop.max - shop.min));
          drafts.push({
            date: at(1 + Math.floor(rand() * days)),
            amount,
            type: "Płatność kartą",
            payee: shop.payee,
            title: "",
            city: "WARSZAWA",
          });
        }
      }
      if (back === 2) {
        drafts.push({ date: at(6), amount: -3899, type: "Płatność kartą", payee: "MEDIA EXPERT", title: "LAPTOP", city: "WARSZAWA" });
      }
      if (back % 2 === 0) {
        drafts.push({ date: at(22), amount: -150, type: "Przelew na telefon", payee: "JAN KOWALSKI", title: "ZWROT ZA BILETY" });
      }
    }

    const now = new Date().toISOString();
    return drafts
      .filter((draft) => draft.date <= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((draft, index) => {
        const description = [
          draft.title ? `Tytuł: ${draft.title}` : "",
          draft.city ? `Lokalizacja: Miasto: ${draft.city} Kraj: POLSKA` : "",
          draft.amount > 0 ? `Nazwa nadawcy: ${draft.payee}` : `Nazwa odbiorcy: ${draft.payee}`,
        ]
          .filter(Boolean)
          .join(" ");
        const id = TransactionFactory.hashId(["demo", accountId, draft.date, draft.amount, draft.payee, index]);
        const base = { payee: draft.payee, title: draft.title, description, type: draft.type, amount: draft.amount };
        return TransactionFactory.create({
          ...base,
          id,
          date: draft.date,
          bookingDate: draft.date,
          accountId,
          category: options.uncategorized ? DEFAULT_CATEGORY : options.categorizer.categorize(base),
          source: "demo",
          externalId: `demo:${id}`,
          createdAt: now,
        });
      });
  }
}
