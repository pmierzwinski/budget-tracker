import type { PeriodEvaluation } from "../shared/types.ts";
import { Repository, type Row } from "../core/Repository.ts";

/** Saved AI evaluations; the key (`scope`) is the range + filters + account. */
export class EvaluationRepository extends Repository {
  static #fromRow(row: Row): PeriodEvaluation {
    return {
      scope: String(row.scope),
      from: String(row.from_date ?? ""),
      to: String(row.to_date ?? ""),
      label: String(row.label ?? ""),
      text: String(row.text ?? ""),
      createdAt: String(row.created_at ?? ""),
    };
  }

  list(): PeriodEvaluation[] {
    return this.all("SELECT * FROM period_evaluations ORDER BY scope ASC").map((row) => EvaluationRepository.#fromRow(row));
  }

  upsert(item: PeriodEvaluation): PeriodEvaluation {
    this.run(
      `INSERT INTO period_evaluations (scope, from_date, to_date, label, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET
         from_date = excluded.from_date,
         to_date = excluded.to_date,
         label = excluded.label,
         text = excluded.text,
         created_at = excluded.created_at`,
      item.scope,
      item.from,
      item.to,
      item.label,
      item.text,
      item.createdAt,
    );
    return item;
  }

  clear(): void {
    this.exec("DELETE FROM period_evaluations;");
  }
}
