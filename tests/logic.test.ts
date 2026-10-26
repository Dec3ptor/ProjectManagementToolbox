import { describe, expect, it } from 'vitest';
import type { BillingCycle, Project, Transaction } from '../src/db/types';
import { byPerson, isBillable, overrideMap, pendingChanges, sourceBillable, totals } from '../src/lib/billability';
import { billingDueDate, billingMonths, currentBillingMonth, monthBilling } from '../src/lib/billing';
import { buildAlerts } from '../src/lib/alerts';
import { projectHealth } from '../src/lib/health';
import { firstCode, matchProject, taskCode } from '../src/lib/matching';
import { cellSymbols, scheduledItems } from '../src/lib/schedule';
import { monthFromText, parseDate } from '../src/lib/dates';
import { DEFAULT_SETTINGS } from '../src/db/db';

const txn = (o: Partial<Transaction> & { id: string }): Transaction => ({
  projectId: 'P',
  taskNumber: 'T',
  taskName: 'Task',
  billableTask: true,
  category: 'Labor',
  type: 'Regular Hours',
  date: '2026-09-10',
  invoicingStatus: 'Uninvoiced',
  quantity: 1,
  uom: 'HOURS',
  cost: 100,
  effort: 150,
  sourceBillable: true,
  importId: 'i',
  ...o,
});

const project = (o: Partial<Project> & { id: string }): Project => ({ name: o.id, status: 'active', mine: true, aliases: [], createdAt: '', updatedAt: '', ...o });

describe('billability', () => {
  it('follows Effort Logic', () => {
    expect(sourceBillable('Labor: Quantity * Bill_Rate', 87.5)).toBe(true);
    expect(sourceBillable('Non Billable Non Converted (Labor / Non Labor) = NULL', 0)).toBe(false);
    expect(sourceBillable('SYSTEM_AMOUNT', 100)).toBe(true);
    expect(sourceBillable(undefined, 0)).toBe(false);
  });

  it('an override wins, and the sums follow it', () => {
    const t = [txn({ id: '1', quantity: 2, cost: 200, effort: 350 }), txn({ id: '2', quantity: 1, cost: 100, effort: 0, sourceBillable: false }), txn({ id: '3', quantity: 4, cost: 400, effort: 600, invoicingStatus: 'Fully invoiced' })];
    const o = overrideMap([{ id: '1', projectId: 'P', billable: false, at: '' }]);
    expect(isBillable(t[0], o)).toBe(false);
    expect(isBillable(t[2], o)).toBe(true);
    const s = totals(t, o);
    expect(s.hours).toBe(7);
    expect(s.billableHours).toBe(4);
    expect(s.nonBillableHours).toBe(3);
    expect(s.billableEffort).toBe(600);
    expect(s.turnedOff).toBe(350);
    expect(s.unbilledEffort).toBe(0);
    expect(pendingChanges(t, o).map((p) => p.txn.id)).toEqual(['1']);
    // an override that agrees with the export is not a pending change
    expect(pendingChanges(t, overrideMap([{ id: '3', projectId: 'P', billable: true, at: '' }]))).toHaveLength(0);
  });

  it('groups by person, suppliers under their own names', () => {
    const t = [txn({ id: '1', person: 'A' }), txn({ id: '2', person: 'A', quantity: 3 }), txn({ id: '3', supplier: 'Lab', uom: 'CURRENCY', quantity: 500, cost: 500 })];
    const g = byPerson(t, overrideMap([]));
    expect(g.map((x) => x.label)).toEqual(['A', 'Lab']);
    expect(g[0].totals.hours).toBe(4);
    expect(g[1].totals.hours).toBe(0);
    expect(g[1].totals.expenses).toBe(500);
  });
});

describe('monthly billing', () => {
  const today = '2026-10-26';
  it('bills last month, due on the settings’ day of this month', () => {
    expect(currentBillingMonth(today)).toBe('2026-09');
    expect(billingDueDate('2026-09', DEFAULT_SETTINGS)).toBe('2026-10-07');
  });

  it('splits the month’s unbilled lines from older ones and non-billables', () => {
    const t = [txn({ id: '1', date: '2026-09-10', effort: 350 }), txn({ id: '2', date: '2026-09-12', effort: 0, sourceBillable: false }), txn({ id: '3', date: '2026-08-20', effort: 600, invoicingStatus: 'Fully invoiced' }), txn({ id: '4', date: '2026-07-02', effort: 150 }), txn({ id: '5', date: '2026-10-02', effort: 999 })];
    const rows = monthBilling('2026-09', [project({ id: 'P' }), project({ id: 'Q', mine: false })], t, overrideMap([]), []);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.thisMonth.map((x) => x.id)).toEqual(['1']);
    expect(r.older.map((x) => x.id)).toEqual(['4']);
    expect(r.nonBillable.map((x) => x.id)).toEqual(['2']);
    expect(r.thisMonthEffort).toBe(350);
    expect(r.olderEffort).toBe(150);
    expect(r.done).toBe(false);
    const cycle: BillingCycle = { id: '2026-09|P', month: '2026-09', projectId: 'P', steps: { reviewed: 'x', invoiced: 'y' }, updatedAt: '' };
    expect(monthBilling('2026-09', [project({ id: 'P' })], t, overrideMap([]), [cycle])[0].done).toBe(true);
  });

  it('lists the months back to the first transaction', () => {
    expect(billingMonths([txn({ id: '1', date: '2026-07-02' })], [], today)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07']);
  });
});

describe('alerts', () => {
  const today = '2026-10-26';
  const base = { projects: [project({ id: 'P', name: 'Landfill' })], txns: [txn({ id: '1', date: '2026-09-10', effort: 350 })], overrides: overrideMap([]), cycles: [], labInvoices: [], rows: [], marks: [], todos: [], imports: [], settings: { ...DEFAULT_SETTINGS, features: { calendar: true, labInvoices: true } }, today };

  it('flags overdue billing, lab invoices waiting and a project over budget', () => {
    const alerts = buildAlerts({
      ...base,
      projects: [project({ id: 'P', name: 'Landfill', fin: { asOf: today, budgetCost: 1000, actualCost: 1200, actualNM: -0.1, remainingBudget: -200 } })],
      labInvoices: [{ id: 'i1', projectName: 'Landfill', status: 'received', invoiceDate: '2026-09-20', amount: 100, createdAt: '', updatedAt: '' }],
    });
    const kinds = alerts.map((a) => `${a.kind}:${a.severity}`);
    expect(kinds).toContain('billing:critical'); // past the 7th
    expect(kinds).toContain('lab:critical'); // 36 days since the invoice
    expect(kinds).toContain('project:critical');
    expect(alerts[0].severity).toBe('critical');
  });

  it('is quiet once billing is done', () => {
    const alerts = buildAlerts({ ...base, cycles: [{ id: '2026-09|P', month: '2026-09', projectId: 'P', steps: { invoiced: 'x' }, updatedAt: '' }] });
    expect(alerts.filter((a) => a.kind === 'billing')).toHaveLength(0);
  });

  it('lists this month’s monitoring and an annual report due', () => {
    const row = { id: 'r', name: 'Burma', months: ['', '', '', '', '', '', '', '', '', '●', '', ''], annualReportDue: 'October', order: 0 };
    const alerts = buildAlerts({ ...base, rows: [row] });
    expect(alerts.some((a) => a.kind === 'monitoring' && a.title.includes('this month'))).toBe(true);
    expect(alerts.some((a) => a.kind === 'report' && a.title.includes('annual report due this month'))).toBe(true);
    // marked done: nothing more to say about the round
    const done = buildAlerts({ ...base, rows: [row], marks: [{ id: 'r|2026-10', rowId: 'r', year: 2026, month: 10, status: 'done', at: '' }] });
    expect(done.some((a) => a.kind === 'monitoring')).toBe(false);
  });
});

describe('health', () => {
  it('reads the money and says why', () => {
    const h = projectHealth(project({ id: 'P', fin: { asOf: '', budgetCost: 1000, actualCost: 900, actualNM: 0.25 } }), [], overrideMap([]), DEFAULT_SETTINGS);
    expect(h.level).toBe('warning');
    expect(h.reasons[0]).toContain('90%');
    expect(projectHealth(project({ id: 'P' }), [], overrideMap([]), DEFAULT_SETTINGS).level).toBe('unknown');
    expect(projectHealth(project({ id: 'P', fin: { asOf: '', budgetCost: 1000, actualCost: 100, actualNM: 0.3 } }), [], overrideMap([]), DEFAULT_SETTINGS).level).toBe('good');
  });
});

describe('matching codes', () => {
  const ps = [project({ id: 'NZL-WSP-2-34646.00', aliases: ['2-34646.00'] }), project({ id: 'NZ0076233.6289', aliases: [] }), project({ id: 'NZL-WSP-2-S4504.03', aliases: [] })];
  it('finds the project behind a job code', () => {
    expect(firstCode('2-34646.00  E2627')).toBe('2-34646.00');
    expect(taskCode('2-34646.00  E2627')).toBe('E2627');
    expect(matchProject('2-34646.00  E2627', ps)?.id).toBe('NZL-WSP-2-34646.00');
    expect(matchProject('NZ0076233.6289', ps)?.id).toBe('NZ0076233.6289');
    expect(matchProject('2-S4504.02', ps)?.id).toBe('NZL-WSP-2-S4504.03'); // last year's job number, same project
    expect(matchProject('2-99999.00', ps)).toBeUndefined();
    expect(matchProject('', ps)).toBeUndefined();
  });
});

describe('schedule cells and dates', () => {
  it('reads the marks', () => {
    expect(cellSymbols('●▲#')).toEqual(['●', '▲', '#']);
    expect(cellSymbols('(_______________)')).toEqual([]);
    expect(cellSymbols('(_GW1 to GW8_X_)')).toEqual(['GW1', 'to', 'GW8', 'X']);
    const items = scheduledItems([{ id: 'r', name: 'x', months: ['●', '', '(____)', '', '', '', '', '', '', '', '', ''], order: 0 }], [], 2026);
    expect(items.map((i) => i.month)).toEqual([1, 3]);
  });
  it('reads dates however they come', () => {
    expect(parseDate('29/09/2026')).toBe('2026-09-29');
    expect(parseDate('2026-09-29T00:00:00')).toBe('2026-09-29');
    expect(parseDate(46296)).toBe('2026-10-01');
    expect(parseDate(new Date(2026, 8, 29))).toBe('2026-09-29');
    expect(parseDate('')).toBeUndefined();
    expect(monthFromText('July 31st')).toBe(7);
    expect(monthFromText('due by 1st of September')).toBe(9);
    expect(monthFromText(undefined)).toBeUndefined();
  });
});
