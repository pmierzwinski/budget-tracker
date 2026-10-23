import { useState } from "react";
import { MONTHS_SHORT } from "../../lib/format";
import { currentMonth } from "./period";
import { Icon } from "../../ui/Icon";

export function MonthPicker({
  active,
  initialYear,
  minMonth,
  maxMonth,
  onPick,
}: {
  active: string;
  initialYear: number;
  minMonth: string;
  maxMonth: string;
  onPick: (month: string) => void;
}) {
  const [year, setYear] = useState(initialYear);
  const now = currentMonth();
  return (
    <div className="popover month-picker" role="dialog" aria-label="Wybierz miesiąc">
      <div className="mp-head">
        <button
          type="button"
          className="step-btn sm"
          aria-label="Poprzedni rok"
          disabled={year <= Number(minMonth.slice(0, 4))}
          onClick={() => setYear(year - 1)}
        >
          <Icon name="left" size={16} />
        </button>
        <strong>{year}</strong>
        <button
          type="button"
          className="step-btn sm"
          aria-label="Następny rok"
          disabled={year >= Number(maxMonth.slice(0, 4))}
          onClick={() => setYear(year + 1)}
        >
          <Icon name="right" size={16} />
        </button>
      </div>
      <div className="mp-grid">
        {MONTHS_SHORT.map((label, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          const classes = [month === active ? "active" : "", month === now ? "now" : ""].filter(Boolean);
          return (
            <button
              key={month}
              type="button"
              className={classes.join(" ") || undefined}
              disabled={month < minMonth || month > maxMonth}
              onClick={() => onPick(month)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
