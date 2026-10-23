import type { ImportPreview } from "../../../shared/types";
import { formatDay, plural } from "../../lib/format";
import { Icon } from "../../ui/Icon";

/** What the chosen file would add, with "Importuj" / "Anuluj". */
export function ImportPreviewCard({
  preview,
  busy,
  withAi,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview | null;
  busy: boolean;
  withAi: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!preview) {
    return (
      <div className="import-preview" aria-live="polite">
        <p className="muted">Czytam plik…</p>
      </div>
    );
  }
  const rest = preview.fresh - preview.categorized;
  return (
    <div className="import-preview" aria-live="polite">
      <p className="import-preview-title">
        <Icon name="check" size={18} />
        Odczytano {preview.total} {plural(preview.total, "płatność", "płatności", "płatności")} · {preview.bankName}
        {preview.minDate ? ` · ${formatDay(preview.minDate)} – ${formatDay(preview.maxDate)}` : ""}
      </p>
      <ul className="import-preview-facts">
        <li>
          <strong>{preview.fresh}</strong> {plural(preview.fresh, "nowa", "nowe", "nowych")}
          {preview.duplicates ? `, ${preview.duplicates} już jest w bazie (pominę)` : ""}
        </li>
        <li>
          {preview.account.id ? `Trafią na konto „${preview.account.name}”` : `Powstanie nowe konto „${preview.account.name}”`}
        </li>
        {preview.fresh ? (
          <li>
            <strong>{preview.categorized}</strong> z nowych dostanie kategorię od razu (Twoje reguły i wbudowane wzorce, np.
            Biedronka → Spożywcze)
            {rest
              ? withAi
                ? `; ${rest} ${plural(rest, "pozostałą", "pozostałe", "pozostałych")} skategoryzuje AI`
                : `; ${rest} ${plural(rest, "pozostała trafi", "pozostałe trafią", "pozostałych trafi")} do „Inne”`
              : ""}
          </li>
        ) : null}
      </ul>
      <div className="row">
        <button className="primary" type="button" disabled={busy || !preview.fresh} onClick={onConfirm}>
          <Icon name="upload" size={16} />
          {busy
            ? "Importuję…"
            : preview.fresh
              ? `Importuj ${preview.fresh} ${plural(preview.fresh, "płatność", "płatności", "płatności")}`
              : "Nic nowego do zaimportowania"}
        </button>
        <button className="ghost" type="button" disabled={busy} onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </div>
  );
}
