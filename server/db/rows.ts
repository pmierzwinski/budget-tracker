// Row → object mappers for the tables.
import { DEFAULT_CATEGORY } from "../../shared/domain.ts";
import type { Account, PeriodEvaluation, Transaction } from "../../shared/types.ts";
import type { Row } from "../platform/db.ts";

export function rowToTx(row: Row): Transaction {
  return {
    id: String(row.id),
    date: String(row.date),
    bookingDate: String(row.booking_date ?? ""),
    amount: Number(row.amount),
    currency: String(row.currency ?? "PLN"),
    type: String(row.type ?? ""),
    payee: String(row.payee ?? ""),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    accountIban: String(row.account_iban ?? ""),
    accountId: String(row.account_id ?? ""),
    category: String(row.category || DEFAULT_CATEGORY),
    comment: String(row.comment ?? ""),
    excluded: Number(row.excluded || 0) === 1,
    manualCategory: Number(row.manual_category || 0) === 1,
    source: (row.source as Transaction["source"]) || "csv",
    externalId: String(row.external_id ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export function rowToAccount(row: Row): Account {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    bank: String(row.bank ?? ""),
    iban: String(row.iban ?? ""),
    provider: (String(row.provider ?? "") as Account["provider"]) || "",
    count: Number(row.count || 0),
    minDate: String(row.min_date ?? ""),
    maxDate: String(row.max_date ?? ""),
  };
}

export function rowToEvaluation(row: Row): PeriodEvaluation {
  return {
    scope: String(row.scope),
    from: String(row.from_date ?? ""),
    to: String(row.to_date ?? ""),
    label: String(row.label ?? ""),
    text: String(row.text ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}
