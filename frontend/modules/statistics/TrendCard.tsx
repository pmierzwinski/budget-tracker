import { TrendLines } from "../charts";
import { Icon } from "../../ui/Icon";
import { Segmented } from "../../ui/Segmented";
import { GRANULARITY_LABELS, type Granularity, type TimeBucket } from "../period";
import type { TrendSeries } from "./useTrendChart";

const GRANULARITIES = Object.keys(GRANULARITY_LABELS) as Granularity[];

/** Category lines over time with the axis split, "Pokaż ukryte", manual Y cap and "Pokaż wszystkie". */
export function TrendCard({
  buckets,
  series,
  granularity,
  autoGranularity,
  onGranularity,
  showExcluded,
  excludedCount,
  onShowExcluded,
  yMaxInput,
  onYMaxInput,
  hidden,
  onShowAll,
  onLegend,
  selected,
  onPick,
}: {
  buckets: TimeBucket[];
  series: TrendSeries[];
  granularity: Granularity;
  autoGranularity: Granularity;
  onGranularity: (next: Granularity) => void;
  showExcluded: boolean;
  excludedCount: number;
  onShowExcluded: (next: boolean) => void;
  yMaxInput: string;
  onYMaxInput: (value: string) => void;
  hidden: Set<string>;
  onShowAll: () => void;
  onLegend: (category: string) => void;
  selected: { index: number; category: string } | null;
  onPick: (index: number, category: string) => void;
}) {
  const typed = Number(yMaxInput.replace(",", "."));
  const yMax = yMaxInput.trim() && !Number.isNaN(typed) && typed > 0 ? typed : undefined;
  return (
    <article className="card trend-card">
      <div className="card-head">
        <div>
          <h2>Wydatki kategorii w czasie</h2>
          <p className="card-sub">
            Najedź na punkt, żeby zobaczyć kwoty · kliknij punkt albo kategorię w legendzie, żeby zobaczyć jej
            płatności
          </p>
        </div>
        <div className="trend-tools">
          <Segmented
            options={GRANULARITIES.map((option) => ({
              id: option,
              label: GRANULARITY_LABELS[option],
              title: option === autoGranularity ? "Domyślny podział dla tego okresu" : undefined,
            }))}
            value={granularity}
            onChange={onGranularity}
            label="Podział osi czasu"
            small
          />
          <button
            type="button"
            className={showExcluded ? "toggle-chip sm active" : "toggle-chip sm"}
            aria-pressed={showExcluded}
            disabled={!excludedCount && !showExcluded}
            title={
              excludedCount
                ? "Płatności ukryte w statystykach (np. duże jednorazowe) — pokaż je w ich kategoriach"
                : "W tym okresie nie ma ukrytych płatności"
            }
            onClick={() => onShowExcluded(!showExcluded)}
          >
            <Icon name={showExcluded ? "eye" : "eyeOff"} size={14} />
            {showExcluded ? "Ukryte widoczne" : "Pokaż ukryte"}
            <span className="count">{excludedCount}</span>
          </button>
          <label
            className="ymax-field"
            title="Wszystko powyżej tej kwoty zostanie ucięte — przydaje się, gdy jeden szczyt spłaszcza resztę wykresu"
          >
            Oś Y do
            <input inputMode="decimal" placeholder="zł" value={yMaxInput} onChange={(e) => onYMaxInput(e.target.value)} />
          </label>
          {hidden.size ? (
            <button type="button" className="ghost sm" onClick={onShowAll}>
              Pokaż wszystkie
            </button>
          ) : null}
        </div>
      </div>
      {series.length ? (
        <TrendLines
          points={buckets}
          series={series}
          hidden={hidden}
          onLegend={onLegend}
          yMax={yMax}
          selected={selected}
          onPick={onPick}
        />
      ) : (
        <p className="muted">W tym okresie są tylko wpływy — brak wydatków do narysowania.</p>
      )}
    </article>
  );
}
