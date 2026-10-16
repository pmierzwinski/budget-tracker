import { formatEvaluationText, type EvaluationParts } from "../shared/ai.ts";
import { evaluationKey } from "../shared/domain.ts";
import { MONTHS_NOMINATIVE, isCalendarMonth } from "../shared/dates.ts";
import { round2 } from "../shared/numbers.ts";
import type { PeriodEvaluation, TxFilters } from "../shared/types.ts";
import type { AccountService } from "../accounts/AccountService.ts";
import type { InsightsService } from "../statistics/InsightsService.ts";
import type { StatsService } from "../statistics/StatsService.ts";
import type { TransactionRepository } from "../transactions/TransactionRepository.ts";
import type { AiClient } from "./AiClient.ts";
import type { EvaluationRepository } from "./EvaluationRepository.ts";

const WEEKDAY_NAMES = ["nd", "pn", "wt", "śr", "cz", "pt", "so"];

const SYSTEM_PROMPT =
  "Jesteś trzeźwym komentatorem domowego budżetu w Polsce, na podstawie historii konta bankowego. " +
  "Odpowiedz na cztery pytania. Każde 1–3 zdania, po polsku, z konkretnymi nazwami i kwotami z danych. " +
  "Nie wymyślaj transakcji spoza danych. Kwoty w złotych. " +
  "Zero motywacyjnego tonu i ogólników typu „warto oszczędzać” albo „trzeba się ograniczyć”. " +
  "1) main — główny wydatek okresu: największa kategoria albo pojedyncza płatność, która zjadła kasę. " +
  "2) flexible — na co poza stałymi, trudnymi do ominięcia płatnościami (rachunki, czynsz, mieszkanie, kredyt) poszło najwięcej. " +
  "3) save — co w tym okresie dałoby się realnie uciąć albo zmienić, żeby zostało więcej; wskaż konkretne pozycje, nie ogólne rady. " +
  "4) hidden — ogólna ocena tego, czego nie widać na pierwszy rzut oka: drobne płatności, które się sumują, weekend kontra tydzień, jeden odbiorca, dziura w „Inne”, jednoraz kontra stałe. " +
  'Zwróć JSON: {"main":"...","flexible":"...","save":"...","hidden":"..."}';

/** Amounts exactly as the user typed them — part of the evaluation key the frontend looks up. */
export type TypedAmounts = { minAmount?: string; maxAmount?: string };

/** Four short Polish answers about the current view (period + filters), saved per view. */
export class PeriodEvaluationService {
  readonly #ai: AiClient;
  readonly #stats: StatsService;
  readonly #insights: InsightsService;
  readonly #transactions: TransactionRepository;
  readonly #accounts: AccountService;
  readonly #evaluations: EvaluationRepository;

  constructor(
    ai: AiClient,
    stats: StatsService,
    insights: InsightsService,
    transactions: TransactionRepository,
    accounts: AccountService,
    evaluations: EvaluationRepository,
  ) {
    this.#ai = ai;
    this.#stats = stats;
    this.#insights = insights;
    this.#transactions = transactions;
    this.#accounts = accounts;
    this.#evaluations = evaluations;
  }

  list(): PeriodEvaluation[] {
    return this.#evaluations.list();
  }

  async evaluate(view: TxFilters, typed: TypedAmounts): Promise<PeriodEvaluation> {
    const from = (view.from || "").trim();
    const to = (view.to || "").trim();
    if (!from || !to) throw new Error("Podaj zakres dat.");

    const input = { ...view, category: view.category?.trim() || undefined };
    const filters: TxFilters = {
      from,
      to,
      category: input.category,
      kind: input.kind,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      account: input.account,
    };
    const periodStats = this.#stats.stats({ from, to, account: input.account });
    if (!periodStats.count) throw new Error("Brak transakcji w tym okresie.");

    const listed = this.#transactions.list({
      ...filters,
      kind: filters.kind === "income" ? "income" : "expense",
      sort: "amount_desc",
      limit: 30,
    });
    if (!listed.matched && (filters.category || filters.minAmount != null || filters.maxAmount != null)) {
      throw new Error("Brak wydatków w tym widoku.");
    }

    const insights = this.#insights.insights({ from, to, account: input.account });
    const payload = {
      period: {
        from,
        to,
        income: round2(periodStats.income),
        expenses: round2(periodStats.expenses),
        net: round2(periodStats.net),
        count: periodStats.count,
        categories: periodStats.byCategory
          .filter((row) => row.amount < 0)
          .slice(0, 12)
          .map((row) => ({ category: row.category, spent: round2(-row.amount) })),
        months: periodStats.byMonth.map((row) => ({
          month: row.month,
          income: round2(row.income),
          expenses: round2(row.expenses),
          net: round2(row.income - row.expenses),
        })),
      },
      fixedHint:
        "Za stałe / trudne do ominięcia uważaj m.in. Rachunki, Mieszkanie oraz przelewy wyglądające na czynsz, kredyt albo ubezpieczenie.",
      topPayees: insights.payees.slice(0, 8).map((row) => ({
        name: row.name,
        category: row.category,
        spent: round2(row.amount),
        count: row.count,
      })),
      daily: {
        average: round2(insights.daily.average),
        weekdayAverage: round2(insights.daily.weekdayAverage),
        weekendAverage: round2(insights.daily.weekendAverage),
        maxDay: insights.daily.maxDay
          ? { date: insights.daily.maxDay.date, spent: round2(insights.daily.maxDay.amount) }
          : null,
        noSpendDays: insights.daily.noSpendDays,
      },
      weekdays: periodStats.byWeekday
        .filter((row) => row.amount > 0.004)
        .map((row) => ({ day: WEEKDAY_NAMES[row.id] || String(row.id), spent: round2(row.amount) })),
      recurring: insights.recurring
        .filter((row) => row.status !== "hidden")
        .slice(0, 8)
        .map((row) => ({
          name: row.name,
          category: row.category,
          typical: round2(row.amount),
          months: row.months,
          status: row.status,
        })),
      visible: {
        category: input.category || null,
        kind: input.kind && input.kind !== "all" ? input.kind : "expense",
        minAmount: input.minAmount ?? null,
        maxAmount: input.maxAmount ?? null,
        transactions: listed.items.map((tx) => ({
          date: tx.date,
          payee: (tx.payee || tx.title || tx.type).slice(0, 70),
          title: tx.title.slice(0, 80),
          amount: round2(tx.amount),
          category: tx.category,
          comment: tx.comment || undefined,
        })),
        moreTransactions: Math.max(0, listed.matched - listed.items.length),
      },
    };

    const parsed = (await this.#ai.chatJson(SYSTEM_PROMPT, `Oceń ten widok:\n${JSON.stringify(payload)}`, 0.4)) as EvaluationParts & {
      text?: string;
    };

    const text = formatEvaluationText(parsed) || String(parsed.text || "").trim();
    const accountName = input.account ? this.#accounts.get(input.account)?.name : undefined;
    if (!text) throw new Error("AI nie zwróciło oceny.");

    return this.#evaluations.upsert({
      scope: evaluationKey({
        from,
        to,
        category: input.category,
        kind: input.kind,
        minAmount: typed.minAmount,
        maxAmount: typed.maxAmount,
        account: input.account,
      }),
      from,
      to,
      label: `${PeriodEvaluationService.#viewLabel({ from, to, category: input.category })}${accountName ? ` · ${accountName}` : ""}`,
      text,
      createdAt: new Date().toISOString(),
    });
  }

  static #monthLabel(month: string): string {
    const [year, m] = month.split("-").map(Number);
    const name = MONTHS_NOMINATIVE[(m || 1) - 1] || month;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
  }

  static #viewLabel(filters: { from: string; to: string; category?: string }): string {
    let label = isCalendarMonth(filters.from, filters.to)
      ? PeriodEvaluationService.#monthLabel(filters.from.slice(0, 7))
      : `${filters.from} – ${filters.to}`;
    if (filters.category) label += ` · ${filters.category.replaceAll(",", ", ")}`;
    return label;
  }
}
