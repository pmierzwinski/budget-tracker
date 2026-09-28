import { MONTHS_SHORT, money, monthLabel } from "../../format";

const PLOT = 110;

export function MonthBars({ months }: { months: { month: string; income: number; expenses: number }[] }) {
  const max = Math.max(1, ...months.flatMap((row) => [row.income, row.expenses]));
  const labelEvery = Math.max(1, Math.ceil(months.length / 12));
  return (
    <div>
      <div className="vcols">
        {months.map((row, index) => (
          <div
            key={row.month}
            className="vcol"
            title={`${monthLabel(row.month)}\nprzychody ${money(row.income)}\nwydatki ${money(row.expenses)}`}
          >
            <span className="vcol-pair">
              <span className="vcol-bar income" style={{ height: `${Math.max(2, (row.income / max) * PLOT)}px` }} />
              <span className="vcol-bar expense" style={{ height: `${Math.max(2, (row.expenses / max) * PLOT)}px` }} />
            </span>
            <span className="vcol-label">
              {(months.length - 1 - index) % labelEvery === 0 ? MONTHS_SHORT[Number(row.month.slice(5, 7)) - 1] : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="chart-key">
        <span className="dot income" />
        przychody
        <span className="dot expense" />
        wydatki
      </p>
    </div>
  );
}
