import { getContext } from "../../app/AppContext";
import { allPeriod, latestMonthPeriod, type Period } from "./period";

/** Empty state for a period without payments: jump to the last month with data or the whole history. */
export function EmptyPeriod({ title, totalAll, onPeriod }: { title: string; totalAll: number; onPeriod: (period: Period) => void }) {
  const { meta, navigate } = getContext();
  return (
    <div className="empty-card">
      <h2>{title}</h2>
      <p>
        {totalAll
          ? `W bazie jest ${totalAll} operacji — wybierz okres, w którym coś się działo.`
          : "Zaimportuj historię z banku, a statystyki pojawią się od razu."}
      </p>
      <div className="row">
        {totalAll ? (
          <>
            <button type="button" className="primary" onClick={() => onPeriod(latestMonthPeriod(meta.maxDate))}>
              Ostatni miesiąc z danymi
            </button>
            <button type="button" className="ghost" onClick={() => onPeriod(allPeriod(meta.minDate, meta.maxDate))}>
              Cały okres
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => navigate("import")}>
            Importuj historię
          </button>
        )}
      </div>
    </div>
  );
}
