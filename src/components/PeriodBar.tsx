import { currentMonth, isoDate, monthRange, shiftPeriod } from "../format";

export type Period = { from: string; to: string };

export function allPeriod(minDate: string, maxDate: string): Period {
  return { from: minDate, to: maxDate };
}

export function applyPreset(
  preset: string,
  minDate: string,
  maxDate: string,
): Period {
  const today = new Date();
  if (preset === "all") return allPeriod(minDate, maxDate);
  if (preset === "month") return monthRange(currentMonth());
  if (preset === "30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: isoDate(from), to: isoDate(today) };
  }
  if (preset === "90") {
    const from = new Date(today);
    from.setDate(from.getDate() - 89);
    return { from: isoDate(from), to: isoDate(today) };
  }
  return allPeriod(minDate, maxDate);
}

export function PeriodBar({
  period,
  minDate,
  maxDate,
  onChange,
}: {
  period: Period;
  minDate: string;
  maxDate: string;
  onChange: (period: Period) => void;
}) {
  const presets = [
    { id: "all", label: "Cały okres" },
    { id: "month", label: "Ten miesiąc" },
    { id: "30", label: "30 dni" },
    { id: "90", label: "90 dni" },
  ];
  const canStep = Boolean(period.from && period.to);

  return (
    <div className="period-bar">
      <div className="presets">
        {presets.map((preset) => {
          const next = applyPreset(preset.id, minDate, maxDate);
          const active = period.from === next.from && period.to === next.to;
          return (
            <button
              key={preset.id}
              type="button"
              className={active ? "active" : undefined}
              onClick={() => onChange(next)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="month-step">
        <button type="button" disabled={!canStep} onClick={() => onChange(shiftPeriod(period, -1))}>
          ← Poprzedni miesiąc
        </button>
        <button type="button" disabled={!canStep} onClick={() => onChange(shiftPeriod(period, 1))}>
          Kolejny miesiąc →
        </button>
      </div>
      <label>
        Od
        <input type="date" value={period.from} onChange={(e) => onChange({ ...period, from: e.target.value })} />
      </label>
      <label>
        Do
        <input type="date" value={period.to} onChange={(e) => onChange({ ...period, to: e.target.value })} />
      </label>
    </div>
  );
}
