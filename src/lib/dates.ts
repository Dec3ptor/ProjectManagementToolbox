// Dates as YYYY-MM-DD strings, months as YYYY-MM, with the odd Excel serial or dd/mm/yyyy from an import.

const pad = (n: number) => String(n).padStart(2, '0');

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export const nowIso = () => new Date().toISOString();

/** A date from whatever a spreadsheet cell held: a Date, an Excel serial, dd/mm/yyyy or yyyy-mm-dd. */
export function parseDate(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : toDateStr(v);
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return undefined;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : toDateStr(d);
}

export const monthOf = (date: string) => date.slice(0, 7);

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return toDateStr(new Date(y, m, 0));
}

/** Whole days from a to b (negative when b is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDate(date?: string): string {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export function formatMonth(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

/** The month a day-of-month name refers to ("October", "July 31st", "end of Feb") – 1–12, or undefined. */
export function monthFromText(text?: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  for (let i = 0; i < 12; i++) if (t.includes(MONTHS_LONG[i].toLowerCase()) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.exec(t)?.[1] === MONTHS_SHORT[i].toLowerCase()) return i + 1;
  return undefined;
}
