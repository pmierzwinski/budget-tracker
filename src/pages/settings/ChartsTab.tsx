import { useState } from "react";
import { DEFAULT_AMOUNT_THRESHOLDS as DEFAULT_THRESHOLDS, MAX_AMOUNT_THRESHOLDS as MAX_THRESHOLDS } from "../../modules/shared/domain.ts";
import { api } from "../../api";
import { useApp } from "../../app/AppContext";
import { Icon } from "../../components/Icon";
import { Notices } from "../../components/ui/Notices";
import { useAction } from "../../hooks/useAction";

function toNumbers(drafts: string[]): number[] {
  return drafts
    .map((value) => Number(value.replace(/\s/g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function normalize(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value)))].sort((a, b) => a - b);
}

function bucketLabels(thresholds: number[]): string[] {
  if (!thresholds.length) return ["Wszystkie"];
  const fmt = (value: number) => value.toLocaleString("pl-PL");
  const labels = [`<${fmt(thresholds[0])} zł`];
  for (let i = 1; i < thresholds.length; i += 1) labels.push(`${fmt(thresholds[i - 1])}–${fmt(thresholds[i])} zł`);
  labels.push(`>${fmt(thresholds[thresholds.length - 1])} zł`);
  return labels;
}

export function ChartsTab() {
  const { meta, refreshMeta } = useApp();
  const saved = meta.amountThresholds;
  const [drafts, setDrafts] = useState<string[]>(() => saved.map(String));
  const { busy, message, error, setMessage, run } = useAction();

  const preview = normalize(toNumbers(drafts));
  const invalid = drafts.some((value) => value.trim() && !toNumbers([value]).length);
  const dirty = preview.join(",") !== saved.join(",");

  function save(values: number[]) {
    return run(async () => {
      const result = await api.saveAmountThresholds(values);
      setDrafts(result.thresholds.map(String));
      setMessage("Zapisano przedziały — wykres „Wielkość płatności” na Przeglądzie już ich używa.");
      await refreshMeta();
    }, "Nie zapisano przedziałów");
  }

  return (
    <>
      <Notices message={message} error={error} />

      <div className="split">
        <article className="card">
          <div className="card-head">
            <div>
              <h2>Wielkość płatności</h2>
              <p className="card-sub">Granice przedziałów w złotych. Kolejność ustawi się sama.</p>
            </div>
          </div>
          <form
            className="threshold-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!invalid && preview.length) void save(preview);
            }}
          >
            <div className="threshold-list">
              {drafts.map((value, index) => (
                <div key={index} className="money-input threshold">
                  <input
                    inputMode="decimal"
                    aria-label={`Granica ${index + 1}`}
                    value={value}
                    onChange={(e) =>
                      setDrafts((current) => current.map((item, i) => (i === index ? e.target.value : item)))
                    }
                  />
                  <span>zł</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Usuń granicę ${value || index + 1}`}
                    disabled={drafts.length <= 1}
                    onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost sm"
                disabled={drafts.length >= MAX_THRESHOLDS}
                onClick={() => {
                  const last = preview[preview.length - 1] || 0;
                  setDrafts((current) => [...current, String(last ? last * 2 : 100)]);
                }}
              >
                <Icon name="plus" size={14} />
                Dodaj granicę
              </button>
            </div>
            {invalid ? <p className="field-hint warn">Każda granica musi być dodatnią kwotą.</p> : null}

            <div className="threshold-preview">
              <span className="muted">Przedziały na wykresie</span>
              <div className="row">
                {bucketLabels(preview).map((label) => (
                  <span key={label} className="pill">
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="row">
              <button className="primary" type="submit" disabled={busy || invalid || !preview.length || !dirty}>
                Zapisz przedziały
              </button>
              <button
                className="ghost"
                type="button"
                disabled={busy || saved.join(",") === DEFAULT_THRESHOLDS.join(",")}
                onClick={() => void save(DEFAULT_THRESHOLDS)}
              >
                Przywróć domyślne
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <h2>Podpowiedź</h2>
          <p className="muted">
            Dobre przedziały dzielą płatności mniej więcej po równo. Jeśli większość zakupów to drobne kwoty, dodaj
            gęstsze granice na dole (np. 20, 50, 100), a pojedynczy próg dla dużych wydatków.
          </p>
          <p className="muted">Maksymalnie {MAX_THRESHOLDS} granic, czyli {MAX_THRESHOLDS + 1} słupków.</p>
        </article>
      </div>
    </>
  );
}
