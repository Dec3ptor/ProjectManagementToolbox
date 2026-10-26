import { describe, expect, it } from 'vitest';
import type { BillingCycle, Project, Transaction } from '../src/db/types';
import { billingMode, claimTotal, previousProgress, taskClaims } from '../src/lib/tasks';
import { monthBilling } from '../src/lib/billing';
import { buildAlerts } from '../src/lib/alerts';
import { overrideMap } from '../src/lib/billability';
import { DEFAULT_SETTINGS } from '../src/db/db';

const project = (o: Partial<Project> & { id: string }): Project => ({ name: o.id, status: 'active', mine: true, aliases: [], createdAt: '', updatedAt: '', ...o });
const txn = (o: Partial<Transaction> & { id: string }): Transaction => ({ projectId: 'P', taskNumber: '001', taskName: 'Report', billableTask: true, category: 'Labor', type: 'Regular Hours', date: '2026-09-10', invoicingStatus: 'Uninvoiced', quantity: 1, uom: 'HOURS', cost: 100, effort: 0, sourceBillable: true, importId: 'i', ...o });
const cycle = (month: string, taskProgress: Record<string, number>): BillingCycle => ({ id: `${month}|P`, month, projectId: 'P', steps: {}, taskProgress, updatedAt: '' });

describe('billing per task', () => {
  const p = project({ id: 'P', billingMode: 'task', taskFees: [{ taskNumber: '001', taskName: 'Report', fee: 10000 }, { taskNumber: '002', taskName: 'Site visit', fee: 4000 }] });

  it('follows the finance system’s bill plan unless chosen', () => {
    expect(billingMode(project({ id: 'A', billPlanMethod: 'Percent Complete Invoice' }))).toBe('task');
    expect(billingMode(project({ id: 'A', billPlanMethod: 'Amount Based Invoice' }))).toBe('task');
    expect(billingMode(project({ id: 'A', billPlanMethod: 'Bill Rate Invoice' }))).toBe('time');
    expect(billingMode(project({ id: 'A', billPlanMethod: 'Percent Complete Invoice', billingMode: 'time' }))).toBe('time');
  });

  it('claims the percentage added since the last claim, task by task', () => {
    const cycles = [cycle('2026-07', { '001': 20 }), cycle('2026-08', { '001': 50, '002': 100 }), cycle('2026-09', { '001': 75 })];
    expect(previousProgress('P', '2026-09', cycles)).toEqual({ '001': 50, '002': 100 });
    const claims = taskClaims(p, '2026-09', cycles, [txn({ id: '1', cost: 3000, quantity: 20 }), txn({ id: '2', taskNumber: '003', taskName: 'Extra', cost: 50 })]);
    const report = claims.find((c) => c.taskNumber === '001')!;
    expect(report.previousPct).toBe(50);
    expect(report.pct).toBe(75);
    expect(report.amount).toBe(2500);
    expect(report.claimedToDate).toBe(7500);
    expect(report.remaining).toBe(2500);
    expect(report.costToDate).toBe(3000);
    expect(report.hoursToDate).toBe(20);
    // nothing entered for a task this month: it stays where it was, and claims nothing
    const visit = claims.find((c) => c.taskNumber === '002')!;
    expect(visit.pct).toBe(100);
    expect(visit.amount).toBe(0);
    // a task with time but no fee is listed, so a fee can be given to it
    expect(claims.find((c) => c.taskNumber === '003')).toMatchObject({ fee: 0, amount: 0, taskName: 'Extra' });
    expect(claimTotal(claims)).toBe(2500);
  });

  it('a per-task project’s month is its claim, not its hours', () => {
    const cycles = [cycle('2026-09', { '001': 30 })];
    const rows = monthBilling('2026-09', [p], [txn({ id: '1', effort: 150 })], overrideMap([]), cycles);
    expect(rows[0].mode).toBe('task');
    expect(rows[0].toInvoice).toBe(3000);
    expect(rows[0].thisMonthEffort).toBe(150);
  });

  it('asks for the % complete when work was done and none is entered', () => {
    const base = { projects: [p], txns: [txn({ id: '1', effort: 150 })], overrides: overrideMap([]), cycles: [] as BillingCycle[], labInvoices: [], rows: [], marks: [], todos: [], imports: [], settings: DEFAULT_SETTINGS, today: '2026-10-26' };
    const a = buildAlerts(base).find((x) => x.kind === 'billing')!;
    expect(a.detail).toContain('enter each task’s % complete');
    const b = buildAlerts({ ...base, cycles: [cycle('2026-09', { '001': 30 })] }).find((x) => x.kind === 'billing')!;
    expect(b.detail).toContain('$3,000 to claim');
    // no work and nothing entered: nothing to say
    expect(buildAlerts({ ...base, txns: [] }).some((x) => x.kind === 'billing')).toBe(false);
  });
});

describe('switched-off parts', () => {
  it('leave their alerts out', () => {
    const row = { id: 'r', name: 'Burma', months: ['', '', '', '', '', '', '', '', '', '●', '', ''], annualReportDue: 'October', order: 0 };
    const inv = { id: 'i1', projectName: 'Landfill', status: 'received' as const, invoiceDate: '2026-09-20', amount: 100, createdAt: '', updatedAt: '' };
    const base = { projects: [], txns: [], overrides: overrideMap([]), cycles: [], labInvoices: [inv], rows: [row], marks: [], todos: [], imports: [], today: '2026-10-26' };
    const off = buildAlerts({ ...base, settings: DEFAULT_SETTINGS });
    expect(off.filter((a) => a.kind === 'lab' || a.kind === 'monitoring' || a.kind === 'report')).toHaveLength(0);
    const on = buildAlerts({ ...base, settings: { ...DEFAULT_SETTINGS, features: { calendar: true, labInvoices: true } } });
    expect(on.some((a) => a.kind === 'lab')).toBe(true);
    expect(on.some((a) => a.kind === 'monitoring')).toBe(true);
    expect(on.some((a) => a.kind === 'report')).toBe(true);
  });
});
