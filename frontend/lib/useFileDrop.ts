import { useEffect, useRef, useState, type RefObject } from "react";

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".txt") || type.includes("csv") || type === "text/plain";
}

/** Drag & drop of one CSV file onto `zone`; returns whether a file is being dragged over it. */
export function useFileDrop(
  zone: RefObject<HTMLElement | null>,
  options: { busy: boolean; onFile: (file: File) => void; onError: (message: string) => void },
): boolean {
  const [dragging, setDragging] = useState(false);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    let depth = 0;
    const stop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onEnter = (event: DragEvent) => {
      stop(event);
      depth += 1;
      if (!latest.current.busy) setDragging(true);
    };
    const onOver = (event: DragEvent) => {
      stop(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = latest.current.busy ? "none" : "copy";
    };
    const onLeave = (event: DragEvent) => {
      stop(event);
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      stop(event);
      depth = 0;
      setDragging(false);
      if (latest.current.busy) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) latest.current.onError("Nie znaleziono pliku. Upuść plik CSV na to pole.");
      else if (!isCsvFile(file)) latest.current.onError("To nie wygląda na CSV. Wybierz eksport historii z bankowości (rozszerzenie .csv).");
      else latest.current.onFile(file);
    };
    el.addEventListener("dragenter", onEnter);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onEnter);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("dragleave", onLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [zone]);

  return dragging;
}
