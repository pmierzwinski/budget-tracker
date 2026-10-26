import { useEffect, useState } from "react";
import type { TxSort } from "../../../shared/types";
import { getContext } from "../../app/AppContext";
import { categorizeWithAi } from "../../modules/ai";
import { listTransactions, toFilters, useTransactionEdits, type TransactionChange, useTransactionList } from "../../modules/payments";
import { PeriodBar, usePeriod } from "../../modules/period";
import { Notices } from "../../ui/Notices";
import { useAction } from "../../lib/useAction";
import { aiCategorizedMessage } from "../../lib/messages";
import { FilterBar, NO_FILTERS, isFiltered, type PaymentFilters } from "./FilterBar";
import { PaymentsTable } from "./PaymentsTable";
import "./payments-page.css";

export function PaymentsPage() {
  const { database, env, account, meta, paymentsSearch, clearPaymentsSearch } = getContext();
  const { period, setPeriod } = usePeriod("all");
  const [filters, setFilters] = useState<PaymentFilters>(NO_FILTERS);
  const [sort, setSort] = useState<TxSort>("date_desc");
  const ai = useAction();

  const list = useTransactionList(
    () => listTransactions(database.data, toFilters({ ...period, ...filters, sort }, account)),
    [period.from, period.to, JSON.stringify(filters), sort],
    150,
  );

  useEffect(() => {
    if (!paymentsSearch) return;
    setFilters((current) => ({ ...current, q: paymentsSearch }));
    clearPaymentsSearch();
  }, [paymentsSearch, clearPaymentsSearch]);

  const edits = useTransactionEdits({
    updateItems: list.updateItems,
    addCategory: list.addCategory,
    onSaved: (change) => {
      ai.setError("");
      if (change.type !== "comment") ai.setMessage(savedMessage(change));
    },
    onFailed: (message) => {
      ai.setError(message);
      list.reload();
    },
  });

  function changeFilters(patch: Partial<PaymentFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function askAi() {
    return ai.run(async () => {
      ai.setMessage(aiCategorizedMessage(await categorizeWithAi(database, env)));
      list.reload();
    }, "Kategoryzacja AI nie powiodła się");
  }

  return (
    <section className="page tx-page">
      <PeriodBar page="Płatności" period={period} onChange={setPeriod} />
      <FilterBar
        filters={filters}
        onChange={changeFilters}
        categories={list.categories}
        counts={meta}
        matched={list.data?.matched || 0}
        ai={{ hasKey: meta.hasAiKey, busy: ai.busy, run: () => void askAi() }}
      />
      <Notices error={ai.error || list.error} message={ai.message} />
      <PaymentsTable
        items={list.items}
        categories={list.categories}
        sort={sort}
        onSort={setSort}
        edits={edits}
        empty={
          list.loading ? (
            "Ładowanie…"
          ) : (
            <>
              Brak transakcji dla wybranych filtrów.{" "}
              {isFiltered(filters) ? (
                <button type="button" className="link-btn" onClick={() => setFilters(NO_FILTERS)}>
                  Wyczyść filtry
                </button>
              ) : (
                "Sprawdź zakres dat."
              )}
            </>
          )
        }
      />
    </section>
  );
}

function savedMessage(change: TransactionChange): string {
  if (change.type !== "excluded") return "";
  const who = change.item.payee || change.item.title || "Płatność";
  return change.excluded ? `„${who}” nie liczy się już do wykresów, limitów ani wydatków.` : `„${who}” znów liczy się do statystyk.`;
}
