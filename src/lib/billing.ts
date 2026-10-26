// The monthly billing cycle: which month is being billed, what each project has to bill, and how far along it is.

import type { BillingCycle, BillingStep, Project, Settings, Transaction } from '../db/types';
import { isBillable, isUnbilled, type OverrideMap } from './billability';
import { addMonths, monthEnd, monthOf, todayStr } from './dates';
import { isFixedFee } from './format';

export const BILLING_STEPS: Array<{ key: BillingStep; label: string; hint: string }> = [
  { key: 'reviewed', label: 'Time reviewed', hint: 'Looked through everyone’s hours and costs for the month' },
  { key: 'overrides', label: 'Non-billables marked', hint: 'Anything that shouldn’t be charged is turned off here and changed in the finance system' },
  { key: 'sent', label: 'Sent for invoicing', hint: 'Draft invoice / billing instruction sent to the project financial advisor' },
  { key: 'invoiced', label: 'Invoiced', hint: 'The invoice has gone to the client' },
];

/** The month whose billing is on now: last month (billing is done at the start of each month for the month before). */
export function currentBillingMonth(today = todayStr()): string {
  return addMonths(monthOf(today), -1);
}

/** The day billing for a month is due: the settings' day of the following month. */
export function billingDueDate(month: string, s: Settings): string {
  return `${addMonths(month, 1)}-${String(s.billingDueDay).padStart(2, '0')}`;
}

export const cycleId = (month: string, projectId: string) => `${month}|${projectId}`;

export function stepsDone(c?: BillingCycle): number {
  if (!c) return 0;
  if (c.skipped) return BILLING_STEPS.length;
  return BILLING_STEPS.filter((s) => c.steps[s.key]).length;
}

export const cycleDone = (c?: BillingCycle) => !!c && (c.skipped || !!c.steps.invoiced);

export interface ProjectBilling {
  project: Project;
  cycle?: BillingCycle;
  /** Billable, uninvoiced transactions dated in the month. */
  thisMonth: Transaction[];
  /** Billable, uninvoiced transactions from before the month (carried over). */
  older: Transaction[];
  thisMonthEffort: number;
  olderEffort: number;
  thisMonthHours: number;
  /** Transactions in the month that stand as non-billable. */
  nonBillable: Transaction[];
  nonBillableHours: number;
  done: boolean;
  progress: number;
  /** Billed by % complete or a fixed amount, not line by line. */
  fixedFee: boolean;
}

/** What each of my projects has to bill for a month. */
export function monthBilling(month: string, projects: Project[], txns: Transaction[], overrides: OverrideMap, cycles: BillingCycle[]): ProjectBilling[] {
  const end = monthEnd(month);
  const byProject = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.date > end) continue;
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  const cycleMap = new Map(cycles.filter((c) => c.month === month).map((c) => [c.projectId, c]));
  return projects
    .filter((p) => p.mine && p.status === 'active')
    .map((p) => {
      const list = byProject.get(p.id) ?? [];
      const thisMonth: Transaction[] = [];
      const older: Transaction[] = [];
      const nonBillable: Transaction[] = [];
      for (const t of list) {
        const inMonth = monthOf(t.date) === month;
        if (!isBillable(t, overrides)) {
          if (inMonth) nonBillable.push(t);
          continue;
        }
        if (!isUnbilled(t)) continue;
        (inMonth ? thisMonth : older).push(t);
      }
      const cycle = cycleMap.get(p.id);
      const sum = (l: Transaction[], f: (t: Transaction) => number) => l.reduce((a, t) => a + (f(t) || 0), 0);
      return {
        project: p,
        cycle,
        thisMonth,
        older,
        thisMonthEffort: sum(thisMonth, (t) => t.effort),
        olderEffort: sum(older, (t) => t.effort),
        thisMonthHours: sum(thisMonth.filter((t) => t.uom === 'HOURS'), (t) => t.quantity),
        nonBillable,
        nonBillableHours: sum(nonBillable.filter((t) => t.uom === 'HOURS'), (t) => t.quantity),
        done: cycleDone(cycle),
        progress: stepsDone(cycle) / BILLING_STEPS.length,
        fixedFee: isFixedFee(p.billPlanMethod),
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.thisMonthEffort + b.olderEffort - (a.thisMonthEffort + a.olderEffort));
}

/** The months with anything to show: from the earliest transaction to the current billing month. */
export function billingMonths(txns: Transaction[], cycles: BillingCycle[], today = todayStr()): string[] {
  let first = currentBillingMonth(today);
  for (const t of txns) if (t.date && monthOf(t.date) < first) first = monthOf(t.date);
  for (const c of cycles) if (c.month < first) first = c.month;
  const out: string[] = [];
  let m = currentBillingMonth(today);
  // also next month's, once we're in it, so the current month's work can be watched
  out.push(addMonths(m, 1));
  while (m >= first && out.length < 36) {
    out.push(m);
    m = addMonths(m, -1);
  }
  return out;
}
