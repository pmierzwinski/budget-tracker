import { useEffect, useRef, useState } from "react";
import { getContext } from "../../app/AppContext";
import { Icon } from "../../ui/Icon";
import { Swatch } from "../categories";
import { money, plural } from "../../lib/format";
import { listTransactions, toFilters, useTransactionEdits, useTransactionList } from "../payments";
import { TxMiniList } from "./TxMiniList";
import type { TimeBucket } from "../period";

/** Payments of one category in one chart bucket (or the whole period), opened by clicking the chart. */
export function DrillPanel({
  bucket,
  category,
  total,
  showExcluded,
  onClose,
  onChanged,
}: {
  bucket: TimeBucket;
  category: string;
  total: number;
  showExcluded: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { database, account } = getContext();
  const [error, setError] = useState("");
  const ref = useRef<HTMLElement>(null);
  const list = useTransactionList(
    () => listTransactions(database.data, toFilters({ from: bucket.from, to: bucket.to, category, sort: "amount_desc" }, account)),
    [bucket.from, bucket.to, category],
  );
  const items = list.data ? list.items : null;
  const edits = useTransactionEdits({
    updateItems: list.updateItems,
    onSaved: onChanged,
    onFailed: (message) => {
      setError(message);
      list.reload();
    },
  });

  useEffect(() => {
    list.setData(null);
  }, [bucket.from, bucket.to, category]);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [bucket.key, category]);

  const counted = (items || []).filter((row) => showExcluded || !row.excluded);
  const hiddenHere = (items || []).length - counted.length;
  const shownError = error || list.error;

  return (
    <article className="card drill-card" ref={ref} aria-live="polite">
      <div className="card-head">
        <div>
          <p className="eyebrow">{bucket.label}</p>
          <h2 className="drill-title">
            <Swatch category={category} />
            {category}
            <span className="drill-sum">{money(total)}</span>
          </h2>
          <p className="card-sub">
            {items
              ? `${counted.length} ${plural(counted.length, "płatność", "płatności", "płatności")}${
                  hiddenHere
                    ? ` · ${hiddenHere} ${plural(hiddenHere, "ukryta nie liczy", "ukryte nie liczą", "ukrytych nie liczy")} się do wykresu`
                    : ""
                }`
              : "Ładowanie płatności…"}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Zamknij listę płatności" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {shownError ? <p className="banner error">{shownError}</p> : null}
      {items && !items.length ? <p className="muted">Brak płatności w tym zakresie.</p> : null}
      {items?.length ? (
        <TxMiniList
          items={items}
          fadeExcluded={!showExcluded}
          detail={(item) =>
            item.title || item.comment ? (
              <em title={item.title}>{[item.comment, item.title].filter(Boolean).join(" · ")}</em>
            ) : null
          }
          onExcluded={(item, excluded) => void edits.changeExcluded(item, excluded)}
        />
      ) : null}
    </article>
  );
}
