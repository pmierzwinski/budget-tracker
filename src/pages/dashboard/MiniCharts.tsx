import { useApp } from "../../app/AppContext";
import { AmountBars, MonthBars, WeekdayBars } from "../../components/charts";
import type { Stats } from "../../types";

/** Weekday and payment-size charts (both filter the list) and months. */
export function MiniCharts({
  stats,
  weekday,
  onWeekday,
  amountBucket,
  onAmountBucket,
}: {
  stats: Stats;
  weekday: number | null;
  onWeekday: (id: number) => void;
  amountBucket: string;
  onAmountBucket: (id: string) => void;
}) {
  const { navigate } = useApp();
  return (
    <div className="mini-charts">
      <article className="card mini-card">
        <div className="card-head">
          <h2>Dni tygodnia</h2>
          <p className="card-sub">suma wydatków · kliknij, żeby filtrować</p>
        </div>
        {stats.byWeekday?.some((day) => day.amount) ? (
          <WeekdayBars days={stats.byWeekday} selected={weekday} onSelect={onWeekday} />
        ) : (
          <p className="muted">Brak wydatków.</p>
        )}
      </article>
      <article className="card mini-card">
        <div className="card-head">
          <h2>Wielkość płatności</h2>
          <p className="card-sub">
            kliknij, żeby filtrować ·{" "}
            <button type="button" className="link-btn quiet" onClick={() => navigate("settings", "charts")}>
              zmień przedziały
            </button>
          </p>
        </div>
        {stats.byAmount.some((slice) => slice.count) ? (
          <AmountBars slices={stats.byAmount} selected={amountBucket} onSelect={onAmountBucket} />
        ) : (
          <p className="muted">Brak wydatków.</p>
        )}
      </article>
      {stats.byMonth.length > 1 ? (
        <article className="card mini-card wide">
          <div className="card-head">
            <h2>Miesiące</h2>
            <p className="card-sub">przychody i wydatki</p>
          </div>
          <MonthBars months={stats.byMonth} />
        </article>
      ) : null}
    </div>
  );
}
