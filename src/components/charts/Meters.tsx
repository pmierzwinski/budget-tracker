import { WEEKDAY_LABELS, money, percent, roundMoney } from "../../format";

type Meter = { key: string; label: string; value: number; sub: string; title: string; selected: boolean; peak?: boolean };

/** Clickable horizontal meters (`.meters`), used as filters on the dashboard. */
function Meters({ rows, onSelect }: { rows: Meter[]; onSelect: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="meters">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            className={["meter", row.peak ? "peak" : "", row.selected ? "selected" : ""].filter(Boolean).join(" ")}
            aria-pressed={row.selected}
            title={row.title}
            onClick={() => onSelect(row.key)}
          >
            <span className="meter-fill" style={{ width: `${(row.value / max) * 100}%` }} />
            <span className="meter-label">{row.label}</span>
            <span className="meter-value">{row.value ? roundMoney(row.value) : "–"}</span>
            <span className="meter-sub">{row.sub}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Spend per weekday (Monday first); `id` is the JS weekday (0 = Sunday). */
export function WeekdayBars({
  days,
  selected,
  onSelect,
}: {
  days: { id: number; amount: number }[];
  selected?: number | null;
  onSelect?: (id: number) => void;
}) {
  const total = days.reduce((sum, day) => sum + day.amount, 0) || 1;
  const peak = days.reduce((best, day) => (day.amount > best.amount ? day : best), days[0]);
  return (
    <Meters
      rows={days.map((day, index) => ({
        key: String(day.id),
        label: WEEKDAY_LABELS[index],
        value: day.amount,
        sub: percent(day.amount, total),
        title: `${WEEKDAY_LABELS[index]}: ${money(day.amount)} (${percent(day.amount, total)})`,
        selected: selected === day.id,
        peak: peak?.id === day.id && day.amount > 0,
      }))}
      onSelect={(key) => onSelect?.(Number(key))}
    />
  );
}

export function AmountBars({
  slices,
  selected,
  onSelect,
}: {
  slices: { id: string; label: string; amount: number; count: number }[];
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <Meters
      rows={slices.map((slice) => ({
        key: slice.id,
        label: slice.label,
        value: slice.amount,
        sub: `${slice.count} szt.`,
        title: `${slice.label}: ${money(slice.amount)} · ${slice.count} płatności`,
        selected: selected === slice.id,
      }))}
      onSelect={(key) => onSelect?.(key)}
    />
  );
}
