// The monitoring schedule's cells: what a mark like "●▲#" or "(_______________)" means, and a cell's state this year.

import type { MarkStatus, ScheduleMark, ScheduleRow } from '../db/types';

/** A cell with anything in it is a month with something to do. */
export const hasWork = (cell: string | undefined) => !!cell && cell.trim() !== '';

/** The marks in a cell, legible: "●▲#" → ["●", "▲", "#"]; "(___GW1 to GW8_X_)" → its text. */
export function cellSymbols(cell: string | undefined): string[] {
  if (!cell) return [];
  const t = cell.trim();
  if (!t) return [];
  const inner = t.replace(/[()_]+/g, ' ').trim();
  if (inner && !/^[●▲#@$□%R C*]+$/.test(inner)) return inner.split(/\s+/).filter(Boolean);
  return [...t.replace(/[()_\s]/g, '')].filter(Boolean);
}

export const markId = (rowId: string, year: number, month: number) => `${rowId}|${year}-${String(month).padStart(2, '0')}`;

export const MARK_META: Record<MarkStatus, { label: string; color: string; next: MarkStatus }> = {
  todo: { label: 'To do', color: 'blue', next: 'doing' },
  doing: { label: 'Results to analyse / report', color: 'yellow', next: 'done' },
  done: { label: 'Done – results sent / report done', color: 'teal', next: 'cancelled' },
  cancelled: { label: 'Cancelled / on hold', color: 'gray', next: 'todo' },
};

export interface ScheduledItem {
  row: ScheduleRow;
  year: number;
  month: number;
  cell: string;
  status: MarkStatus;
  mark?: ScheduleMark;
}

/** Everything on the schedule for a year, with its state. */
export function scheduledItems(rows: ScheduleRow[], marks: ScheduleMark[], year: number): ScheduledItem[] {
  const byId = new Map(marks.map((m) => [m.id, m]));
  const out: ScheduledItem[] = [];
  for (const row of rows) {
    row.months.forEach((cell, i) => {
      if (!hasWork(cell)) return;
      const mark = byId.get(markId(row.id, year, i + 1));
      out.push({ row, year, month: i + 1, cell, status: mark?.status ?? 'todo', mark });
    });
  }
  return out;
}
