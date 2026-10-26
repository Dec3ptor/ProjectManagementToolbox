// Numbers as people read them: money in dollars, hours, percentages.

const nz = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 });
const nzCents = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (v: number | undefined | null, cents = false): string => (v == null || isNaN(v) ? '–' : (cents ? nzCents : nz).format(v));
export const hours = (v: number | undefined | null): string => (v == null || isNaN(v) ? '–' : `${Number(v.toFixed(2))} h`);
/** A fraction (0.86) or percentage (86) as "86%". */
export const pct = (v: number | undefined | null, fraction = true): string => (v == null || isNaN(v) ? '–' : `${Math.round((fraction ? v * 100 : v) * 10) / 10}%`);
export const num = (v: number | undefined | null, dp = 2): string => (v == null || isNaN(v) ? '–' : Number(v.toFixed(dp)).toLocaleString('en-NZ'));
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function toNumber(v: unknown): number | undefined {
  if (v == null || v === '' || v === '-' || v === '–') return undefined;
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? undefined : n;
}

/** A project's name without the number the export tacks on the end. */
export const shortName = (name: string) => name.replace(/\s*NZL-WSP-\S+$/, '').trim();

/** A project invoiced by % complete or a fixed amount: its uninvoiced lines are not money waiting to be billed. */
export const isFixedFee = (billPlanMethod?: string) => /percent complete|amount based/i.test(billPlanMethod ?? '');

export const text = (v: unknown): string => (v == null ? '' : String(v).trim());

/** A short unique id. */
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
