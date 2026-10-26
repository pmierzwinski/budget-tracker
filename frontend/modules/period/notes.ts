import type { PeriodNote } from "../../../shared/types";
import type { Store } from "../../../shared/store";
import { rangeLabel } from "../../lib/format";
import { describePeriod, type Period } from "./period";

export const NOTE_MAX = 1000;

/** Notes whose dates overlap the selected period, newest ranges first. */
export function notesInPeriod(notes: PeriodNote[], period: Period): PeriodNote[] {
  return notes
    .filter((note) => note.from <= period.to && note.to >= period.from)
    .sort((a, b) => b.from.localeCompare(a.from) || b.createdAt.localeCompare(a.createdAt));
}

/** A calendar month or a run of months by name; any other range as from–to dates. */
export function noteRangeLabel(period: Period): string {
  const info = describePeriod(period, "", "");
  if (info.kind === "month" || info.kind === "months") return info.title;
  return rangeLabel(period.from, period.to);
}

function cleanNote(text: string): string {
  const body = text.trim();
  if (!body) throw new Error("Wpisz opis okresu");
  if (body.length > NOTE_MAX) throw new Error(`Opis może mieć najwyżej ${NOTE_MAX} znaków`);
  return body;
}

export function addPeriodNote(draft: Store, period: Period, text: string): void {
  const body = cleanNote(text);
  if (!period.from || !period.to) throw new Error("Najpierw wybierz okres");
  draft.notes = [
    { id: crypto.randomUUID(), from: period.from, to: period.to, text: body, createdAt: new Date().toISOString() },
    ...(draft.notes ?? []),
  ];
}

export function updatePeriodNote(draft: Store, id: string, text: string): void {
  const body = cleanNote(text);
  const current = (draft.notes ?? []).find((note) => note.id === id);
  if (!current) throw new Error("Nie ma takiego opisu");
  draft.notes = draft.notes.map((note) => (note.id === id ? { ...note, text: body } : note));
}

export function deletePeriodNote(draft: Store, id: string): void {
  draft.notes = (draft.notes ?? []).filter((note) => note.id !== id);
}
