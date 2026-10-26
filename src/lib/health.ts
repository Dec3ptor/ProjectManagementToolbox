// How a project is doing, from the Power BI money and the Effort Report's hours.

import type { Project, Settings, Transaction } from '../db/types';
import { totals, type OverrideMap, type Totals } from './billability';
import { isFixedFee } from './format';

export type HealthLevel = 'good' | 'warning' | 'serious' | 'critical' | 'unknown';

export interface Health {
  level: HealthLevel;
  reasons: string[];
  /** Cost spent as a fraction of the cost budget (Power BI), or effort against revenue budget when that is all we have. */
  spent?: number;
  margin?: number;
  budgetLeft?: number;
  totals: Totals;
}

export const HEALTH_META: Record<HealthLevel, { label: string; color: string; order: number }> = {
  critical: { label: 'Over budget', color: 'red', order: 0 },
  serious: { label: 'At risk', color: 'orange', order: 1 },
  warning: { label: 'Watch', color: 'yellow', order: 2 },
  good: { label: 'On track', color: 'teal', order: 3 },
  unknown: { label: 'No money data', color: 'gray', order: 4 },
};

export function projectHealth(p: Project, txns: Transaction[], overrides: OverrideMap, s: Settings): Health {
  const t = totals(txns, overrides);
  const reasons: string[] = [];
  let level: HealthLevel = 'unknown';
  const fin = p.fin;
  let spent: number | undefined;
  let margin: number | undefined;
  let budgetLeft: number | undefined;
  if (fin && (fin.budgetCost || fin.budgetRevenue)) {
    level = 'good';
    spent = fin.budgetCost ? (fin.actualCost ?? 0) / fin.budgetCost : fin.budgetRevenue ? (fin.itdRevenue ?? 0) / fin.budgetRevenue : undefined;
    margin = fin.actualNM;
    budgetLeft = fin.remainingBudget;
    const pctSpent = (spent ?? 0) * 100;
    if (pctSpent >= 100 || (budgetLeft !== undefined && budgetLeft < 0)) {
      level = 'critical';
      reasons.push(`${Math.round(pctSpent)}% of the cost budget spent`);
    } else if (pctSpent >= s.budgetDangerPct) {
      level = 'serious';
      reasons.push(`${Math.round(pctSpent)}% of the cost budget spent`);
    } else if (pctSpent >= s.budgetWarnPct) {
      level = 'warning';
      reasons.push(`${Math.round(pctSpent)}% of the cost budget spent`);
    }
    if (margin !== undefined && margin * 100 < s.marginWarnPct) {
      reasons.push(margin < 0 ? `Negative margin (${Math.round(margin * 100)}%)` : `Margin ${Math.round(margin * 100)}% is below ${s.marginWarnPct}%`);
      if (margin < 0) level = level === 'critical' ? level : 'serious';
      else if (level === 'good') level = 'warning';
    }
    if (fin.budgetNM !== undefined && margin !== undefined && margin < fin.budgetNM - 0.05) reasons.push(`Margin below the budgeted ${Math.round(fin.budgetNM * 100)}%`);
    if ((fin.totalWIP ?? 0) > 5000) reasons.push(`Unbilled WIP ${Math.round(fin.totalWIP!).toLocaleString('en-NZ')}`);
    if ((fin.totalAR ?? 0) > 0) reasons.push(`${Math.round(fin.totalAR!).toLocaleString('en-NZ')} invoiced and not yet paid`);
  }
  if (t.nonBillablePct > 0.3 && t.hours > 10) reasons.push(`${Math.round(t.nonBillablePct * 100)}% of hours non-billable`);
  if (t.unbilledEffort > 0 && !isFixedFee(p.billPlanMethod)) reasons.push(`${Math.round(t.unbilledEffort).toLocaleString('en-NZ')} of billable work not yet invoiced`);
  return { level, reasons, spent, margin, budgetLeft, totals: t };
}
