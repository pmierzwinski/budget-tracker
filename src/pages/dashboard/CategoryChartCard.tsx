import { useState } from "react";
import { CategoryBars, Donut } from "../../components/charts";
import { Segmented } from "../../components/ui/Segmented";
import type { Stats } from "../../types";

const CHART_TYPES = [
  { id: "bars", label: "Słupki" },
  { id: "pie", label: "Kołowy" },
] as const;

/** Expenses by category (bars with limits, or a donut); clicking filters the payment list. */
export function CategoryChartCard({
  stats,
  selected,
  onSelect,
}: {
  stats: Stats;
  selected: string[];
  onSelect: (category: string, additive: boolean) => void;
}) {
  const [chartType, setChartType] = useState<"bars" | "pie">("bars");
  const slices = stats.byCategory.filter((slice) => slice.amount < 0);
  return (
    <div className="hero-chart">
      <div className="card-head">
        <div>
          <h2>Wydatki według kategorii</h2>
          <p className="card-sub">Kliknij kategorię, żeby zobaczyć jej płatności · Ctrl+klik — kilka naraz</p>
        </div>
        <Segmented options={CHART_TYPES} value={chartType} onChange={setChartType} label="Typ wykresu" small />
      </div>
      {!slices.length ? (
        <p className="muted">Brak wydatków w tym okresie.</p>
      ) : chartType === "pie" ? (
        <Donut slices={slices} selected={selected} onSelect={onSelect} />
      ) : (
        <CategoryBars slices={slices} selected={selected} limits={stats.limits} onSelect={onSelect} />
      )}
    </div>
  );
}
