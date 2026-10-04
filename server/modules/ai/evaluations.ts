import type { PeriodEvaluation } from "../../../shared/types.ts";
import { rowToEvaluation } from "../../db/rows.ts";
import { db, type Row } from "../../platform/db.ts";

export function listPeriodEvaluations(): PeriodEvaluation[] {
  return (db.prepare("SELECT * FROM period_evaluations ORDER BY scope ASC").all() as Row[]).map(rowToEvaluation);
}

export function upsertPeriodEvaluation(item: PeriodEvaluation): PeriodEvaluation {
  db.prepare(
    `INSERT INTO period_evaluations (scope, from_date, to_date, label, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
       from_date = excluded.from_date,
       to_date = excluded.to_date,
       label = excluded.label,
       text = excluded.text,
       created_at = excluded.created_at`,
  ).run(item.scope, item.from, item.to, item.label, item.text, item.createdAt);
  return item;
}
