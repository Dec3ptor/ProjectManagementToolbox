// Reading a workbook (xlsx / xls / csv) into plain rows, one array per sheet.

import * as XLSX from '@e965/xlsx';

export interface SheetRows {
  name: string;
  rows: unknown[][];
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): SheetRows[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, dense: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    return { name, rows };
  });
}

/** The first row (within the first `within` rows) that has every one of these headings; -1 when none. */
export function findHeaderRow(rows: unknown[][], required: string[], within = 12): number {
  const want = required.map((r) => r.toLowerCase().trim());
  for (let i = 0; i < Math.min(rows.length, within); i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase().trim());
    if (want.every((w) => cells.includes(w))) return i;
  }
  return -1;
}

/** Column index by heading (case-insensitive, trimmed), -1 when missing. */
export function columnIndex(header: unknown[]): (name: string) => number {
  const cells = header.map((c) => String(c ?? '').toLowerCase().trim().replace(/\s+/g, ' '));
  return (name: string) => cells.indexOf(name.toLowerCase().trim().replace(/\s+/g, ' '));
}

/** An Excel workbook (xlsx) from rows, for downloads. */
export function writeWorkbook(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
