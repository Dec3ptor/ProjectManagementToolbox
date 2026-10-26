// Which transactions are billable (the export's Effort Logic, unless I've decided otherwise) and the sums that follow.

import type { Override, Transaction } from '../db/types';

/** The export's own view: Effort Logic says "Non Billable…" for the ones that aren't. */
export function sourceBillable(effortLogic: string | undefined, effort: number | undefined): boolean {
  if (effortLogic && /^\s*non[\s-]*billable/i.test(effortLogic)) return false;
  if (!effortLogic && (effort === undefined || effort === 0)) return false;
  return true;
}

export type OverrideMap = ReadonlyMap<string, Override>;

export const overrideMap = (overrides: Override[]): OverrideMap => new Map(overrides.map((o) => [o.id, o]));

/** Billable as it stands: my override when there is one, else the export's. */
export function isBillable(t: Transaction, overrides: OverrideMap): boolean {
  const o = overrides.get(t.id);
  return o ? o.billable : t.sourceBillable;
}

export const isHours = (t: Transaction) => t.uom === 'HOURS';
export const isUnbilled = (t: Transaction) => !/^fully/i.test(t.invoicingStatus ?? '');

export interface Totals {
  count: number;
  hours: number;
  billableHours: number;
  nonBillableHours: number;
  cost: number;
  /** Bill amount of what is billable as it stands. */
  billableEffort: number;
  /** Bill amount the export gave that I've turned off. */
  turnedOff: number;
  unbilledEffort: number;
  unbilledHours: number;
  expenses: number;
  margin: number;
  effectiveRate: number;
  nonBillablePct: number;
}

export function totals(txns: Transaction[], overrides: OverrideMap): Totals {
  const t: Totals = { count: 0, hours: 0, billableHours: 0, nonBillableHours: 0, cost: 0, billableEffort: 0, turnedOff: 0, unbilledEffort: 0, unbilledHours: 0, expenses: 0, margin: 0, effectiveRate: 0, nonBillablePct: 0 };
  for (const x of txns) {
    t.count++;
    const b = isBillable(x, overrides);
    t.cost += x.cost || 0;
    if (isHours(x)) {
      t.hours += x.quantity || 0;
      if (b) t.billableHours += x.quantity || 0;
      else t.nonBillableHours += x.quantity || 0;
    } else t.expenses += x.cost || 0;
    if (b) {
      t.billableEffort += x.effort || 0;
      if (isUnbilled(x)) {
        t.unbilledEffort += x.effort || 0;
        if (isHours(x)) t.unbilledHours += x.quantity || 0;
      }
    } else if (x.sourceBillable) t.turnedOff += x.effort || 0;
  }
  t.margin = t.billableEffort - t.cost;
  t.effectiveRate = t.billableHours ? t.billableEffort / t.billableHours : 0;
  t.nonBillablePct = t.hours ? t.nonBillableHours / t.hours : 0;
  return t;
}

export interface Group<K = string> {
  key: K;
  label: string;
  totals: Totals;
  txns: Transaction[];
}

function groupBy(txns: Transaction[], overrides: OverrideMap, key: (t: Transaction) => string, label: (t: Transaction) => string = key): Group[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    const k = key(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return [...groups.entries()].map(([k, list]) => ({ key: k, label: label(list[0]), totals: totals(list, overrides), txns: list }));
}

/** Hours and money per person (suppliers and equipment under their own names). */
export const byPerson = (txns: Transaction[], overrides: OverrideMap) => groupBy(txns, overrides, (t) => t.person || t.supplier || t.type || 'Other').sort((a, b) => b.totals.hours - a.totals.hours || b.totals.cost - a.totals.cost);

export const byTask = (txns: Transaction[], overrides: OverrideMap) => groupBy(txns, overrides, (t) => t.taskNumber, (t) => `${t.taskName} (${t.taskNumber})`).sort((a, b) => b.totals.cost - a.totals.cost);

export const byMonth = (txns: Transaction[], overrides: OverrideMap) => groupBy(txns, overrides, (t) => t.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));

export const byProject = (txns: Transaction[], overrides: OverrideMap) => groupBy(txns, overrides, (t) => t.projectId);

/** Overrides that differ from the export: the changes still to be made in the finance system. */
export function pendingChanges(txns: Transaction[], overrides: OverrideMap): Array<{ txn: Transaction; override: Override }> {
  const out: Array<{ txn: Transaction; override: Override }> = [];
  for (const t of txns) {
    const o = overrides.get(t.id);
    if (o && o.billable !== t.sourceBillable) out.push({ txn: t, override: o });
  }
  return out.sort((a, b) => b.txn.date.localeCompare(a.txn.date));
}
