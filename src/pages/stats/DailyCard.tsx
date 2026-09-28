import { formatDay, money, plural } from "../../format";
import type { Insights } from "../../types";

export function DailyCard({ daily, untilToday }: { daily: Insights["daily"]; untilToday: boolean }) {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>Dzień po dniu</h2>
          <p className="card-sub">
            {daily.days} {plural(daily.days, "dzień", "dni", "dni")} w okresie
            {untilToday ? " (do dziś)" : ""}
          </p>
        </div>
      </div>
      <dl className="stat-grid">
        <div>
          <dt>Średnio dziennie</dt>
          <dd>{money(daily.average)}</dd>
        </div>
        <div>
          <dt>Typowy dzień (mediana)</dt>
          <dd>{money(daily.median)}</dd>
        </div>
        <div>
          <dt>Dni bez wydatków</dt>
          <dd>
            {daily.noSpendDays}
            <small> z {daily.days}</small>
          </dd>
        </div>
        <div>
          <dt>Najdroższy dzień</dt>
          <dd>
            {daily.maxDay ? money(daily.maxDay.amount) : "—"}
            {daily.maxDay ? <small> {formatDay(daily.maxDay.date, false)}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Dzień roboczy</dt>
          <dd>{money(daily.weekdayAverage)}</dd>
        </div>
        <div>
          <dt>Dzień weekendu</dt>
          <dd className={daily.weekendAverage > daily.weekdayAverage ? "neg" : undefined}>{money(daily.weekendAverage)}</dd>
        </div>
      </dl>
    </article>
  );
}
