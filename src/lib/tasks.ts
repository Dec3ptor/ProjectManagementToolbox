// Projects billed per task: each task has a quoted fee, and each month a % complete is claimed against it.

import type { BillingCycle, BillingMode, Project, TaskFee, Transaction } from '../db/types';
import { isFixedFee } from './format';

/** How the project is billed: as chosen, else per task when the finance system bills it by % complete or amount. */
export const billingMode = (p: Project): BillingMode => p.billingMode ?? (isFixedFee(p.billPlanMethod) ? 'task' : 'time');

export interface TaskClaim {
  taskNumber: string;
  taskName: string;
  fee: number;
  /** Cumulative % claimed before this month. */
  previousPct: number;
  /** Cumulative % claimed as at this month (what is entered for the month, else the previous). */
  pct: number;
  /** This month's claim: the fee times the % added this month. */
  amount: number;
  claimedToDate: number;
  remaining: number;
  /** Burdened cost booked to the task so far (all months). */
  costToDate: number;
  hoursToDate: number;
}

/** The % complete each task had been claimed to, before `month`. */
export function previousProgress(projectId: string, month: string, cycles: BillingCycle[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cycles) {
    if (c.projectId !== projectId || c.month >= month || !c.taskProgress) continue;
    for (const [task, pct] of Object.entries(c.taskProgress)) out[task] = Math.max(out[task] ?? 0, pct);
  }
  return out;
}

/** Each task's fee, progress and this month's claim. Tasks come from the fees set up (and any task with time on it). */
export function taskClaims(p: Project, month: string, cycles: BillingCycle[], txns: Transaction[] = []): TaskClaim[] {
  const fees = new Map<string, TaskFee>((p.taskFees ?? []).map((f) => [f.taskNumber, f]));
  const byTask = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!byTask.has(t.taskNumber)) byTask.set(t.taskNumber, []);
    byTask.get(t.taskNumber)!.push(t);
  }
  const numbers = [...new Set([...fees.keys(), ...byTask.keys()])];
  const prev = previousProgress(p.id, month, cycles);
  const cycle = cycles.find((c) => c.projectId === p.id && c.month === month);
  return numbers
    .map((n) => {
      const fee = fees.get(n)?.fee ?? 0;
      const list = byTask.get(n) ?? [];
      const previousPct = prev[n] ?? 0;
      const pct = cycle?.taskProgress?.[n] ?? previousPct;
      const amount = Math.round(((fee * (pct - previousPct)) / 100) * 100) / 100;
      return {
        taskNumber: n,
        taskName: fees.get(n)?.taskName || list[0]?.taskName || n,
        fee,
        previousPct,
        pct,
        amount,
        claimedToDate: (fee * pct) / 100,
        remaining: fee - (fee * pct) / 100,
        costToDate: list.reduce((a, t) => a + (t.cost || 0), 0),
        hoursToDate: list.filter((t) => t.uom === 'HOURS').reduce((a, t) => a + (t.quantity || 0), 0),
      };
    })
    .sort((a, b) => b.fee - a.fee || a.taskNumber.localeCompare(b.taskNumber));
}

export const claimTotal = (claims: TaskClaim[]) => claims.reduce((a, c) => a + c.amount, 0);
export const feeTotal = (claims: TaskClaim[]) => claims.reduce((a, c) => a + c.fee, 0);
