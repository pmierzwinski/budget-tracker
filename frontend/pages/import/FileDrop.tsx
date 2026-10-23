import { useRef } from "react";
import type { Bank } from "../../../shared/types";
import { useFileDrop } from "../../lib/useFileDrop";
import { Icon } from "../../ui/Icon";

/** Click or drop a CSV file. */
export function FileDrop({
  file,
  busy,
  banks,
  onFile,
  onError,
}: {
  file: File | null;
  busy: boolean;
  banks: Bank[];
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const dragging = useFileDrop(zoneRef, { busy, onFile, onError });

  return (
    <div
      ref={zoneRef}
      className={`drop ${busy ? "disabled" : ""} ${dragging ? "over" : ""}`}
      role="button"
      tabIndex={busy ? -1 : 0}
      onClick={() => {
        if (!busy) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (!busy && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,text/csv"
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) onFile(picked);
          e.target.value = "";
        }}
      />
      <span className="drop-icon">
        <Icon name="upload" size={26} />
      </span>
      <strong>{busy ? "Importuję…" : dragging ? "Upuść plik tutaj" : file ? file.name : "Upuść plik CSV z bankowości"}</strong>
      <span>
        {file ? (
          <>
            <u>wybierz inny plik</u> albo upuść go tutaj
          </>
        ) : (
          <>
            albo <u>kliknij, żeby wybrać</u> ·{" "}
            {banks
              .filter((item) => item.id !== "generic")
              .map((item) => item.name)
              .join(", ")}
          </>
        )}
      </span>
    </div>
  );
}
