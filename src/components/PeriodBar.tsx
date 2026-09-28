import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  MONTHS_SHORT,
  addDays,
  currentMonth,
  describePeriod,
  monthRange,
  stepPeriod,
  today,
} from "../format";
import { Icon } from "./Icon";

export type Period = { from: string; to: string };

export function allPeriod(minDate: string, maxDate: string): Period {
  return { from: minDate, to: maxDate };
}

export function applyPreset(preset: string, minDate: string, maxDate: string): Period {
  const end = today();
  if (preset === "month") return monthRange(currentMonth());
  if (preset === "30") return { from: addDays(end, -29), to: end };
  if (preset === "90") return { from: addDays(end, -89), to: end };
  return allPeriod(minDate, maxDate);
}

export function latestMonthPeriod(maxDate: string): Period {
  const month = currentMonth();
  return monthRange(maxDate && maxDate.slice(0, 7) < month ? maxDate.slice(0, 7) : month);
}

const RANGE_PRESETS = [
  { id: "month", label: "Ten miesiąc" },
  { id: "30", label: "30 dni" },
  { id: "90", label: "90 dni" },
  { id: "all", label: "Cały okres" },
];

function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

function MonthPicker({
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

export function PeriodBar({
  page,
  period,
  minDate,
  maxDate,
  onChange,
  children,
  sticky,
}: {
  page: string;
  period: Period;
  minDate: string;
  maxDate: string;
  onChange: (period: Period) => void;
  children?: ReactNode;
  sticky?: boolean;
}) {
  const [open, setOpen] = useState<"month" | "custom" | null>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(null);
  useDismiss(open === "month", monthRef, close);
  useDismiss(open === "custom", customRef, close);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sticky]);

  const info = describePeriod(period, minDate, maxDate);
  const ready = Boolean(period.from && period.to);
  const latest = maxDate > today() ? maxDate : today();
  const prev = ready && info.kind !== "all" ? stepPeriod(period, -1) : null;
  const next = ready && info.kind !== "all" ? stepPeriod(period, 1) : null;
  const canPrev = Boolean(prev && (!minDate || prev.to >= minDate));
  const canNext = Boolean(next && next.from <= latest);
  const thisMonth = monthRange(currentMonth());
  const onThisMonth = period.from === thisMonth.from && period.to === thisMonth.to;
  const monthMode = info.kind === "month";
  const anchor = (period.to && period.to < latest ? period.to : latest).slice(0, 7);
  const activePreset =
    RANGE_PRESETS.find((preset) => {
      const range = applyPreset(preset.id, minDate, maxDate);
      return range.from === period.from && range.to === period.to;
    })?.id ?? (info.kind === "range" || info.kind === "months" ? "custom" : null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (open || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, dialog, [contenteditable='true']")) return;
      const step = event.key === "ArrowLeft" ? (canPrev ? prev : null) : canNext ? next : null;
      if (!step) return;
      event.preventDefault();
      onChange(step);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pick(nextPeriod: Period) {
    setOpen(null);
    onChange(nextPeriod);
  }

  function editRange(edge: "from" | "to", value: string) {
    if (!value) return;
    const nextPeriod = { ...period, [edge]: value };
    if (nextPeriod.from && nextPeriod.to && nextPeriod.from > nextPeriod.to) {
      if (edge === "from") nextPeriod.to = value;
      else nextPeriod.from = value;
    }
    onChange(nextPeriod);
  }

  return (
    <header className={sticky ? `period-head sticky${stuck ? " stuck" : ""}` : "period-head"}>
      <div className="period-main">
        <p className="eyebrow">{page}</p>
        <div className="period-nav">
          <button
            type="button"
            className="step-btn"
            aria-label={monthMode ? "Poprzedni miesiąc" : "Poprzedni okres"}
            title={monthMode ? "Poprzedni miesiąc (←)" : "Poprzedni okres tej samej długości (←)"}
            disabled={!canPrev}
            onClick={() => prev && onChange(prev)}
          >
            <Icon name="left" />
          </button>
          <div className="period-picker" ref={monthRef}>
            <button
              type="button"
              className={monthMode ? "period-title" : "period-title is-range"}
              aria-haspopup="dialog"
              aria-expanded={open === "month"}
              title="Wybierz miesiąc"
              onClick={() => setOpen(open === "month" ? null : "month")}
            >
              <span>{info.title}</span>
              <Icon name="down" size={16} />
            </button>
            {open === "month" ? (
              <MonthPicker
                active={monthMode ? period.from.slice(0, 7) : ""}
                initialYear={Number((monthMode ? period.from : anchor).slice(0, 4))}
                minMonth={minDate ? minDate.slice(0, 7) : currentMonth()}
                maxMonth={latest.slice(0, 7)}
                onPick={(month) => pick(monthRange(month))}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="step-btn"
            aria-label={monthMode ? "Następny miesiąc" : "Następny okres"}
            title={monthMode ? "Następny miesiąc (→)" : "Następny okres tej samej długości (→)"}
            disabled={!canNext}
            onClick={() => next && onChange(next)}
          >
            <Icon name="right" />
          </button>
          {info.detail ? <span className="period-detail">{info.detail}</span> : null}
          {!onThisMonth ? (
            <button type="button" className="ghost sm today-btn" onClick={() => pick(thisMonth)}>
              Ten miesiąc
            </button>
          ) : null}
        </div>
      </div>
      <div className="period-side">
        {children}
        <div className="period-picker" ref={customRef}>
          <div className="segmented" role="group" aria-label="Inny zakres dat">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={activePreset === preset.id ? "active" : undefined}
                aria-pressed={activePreset === preset.id}
                onClick={() => pick(applyPreset(preset.id, minDate, maxDate))}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              className={activePreset === "custom" ? "active" : undefined}
              aria-expanded={open === "custom"}
              onClick={() => setOpen(open === "custom" ? null : "custom")}
            >
              Własny
            </button>
          </div>
          {open === "custom" ? (
            <div className="popover range-picker" role="dialog" aria-label="Własny zakres dat">
              <label className="field">
                Od
                <input type="date" value={period.from} onChange={(e) => editRange("from", e.target.value)} />
              </label>
              <label className="field">
                Do
                <input type="date" value={period.to} onChange={(e) => editRange("to", e.target.value)} />
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
