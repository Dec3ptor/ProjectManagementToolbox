import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyseWorkbook, planKinds } from '../src/importers/analyse';
import { applyPlan, isMe } from '../src/importers/apply';
import { PmDatabase, DEFAULT_SETTINGS } from '../src/db/db';
import { contactRows, effortRows, labRows, listsRows, overrideRows, P1, P2, powerBiRows, scheduleRows, workbook } from './fixtures';

const settings = { ...DEFAULT_SETTINGS, myName: 'Smith, Jane' };

describe('analysing a workbook', () => {
  it('recognises every kind of sheet in one workbook', () => {
    const plan = analyseWorkbook('tracker.xlsx', workbook({ 'Effort Report': effortRows(), Export: powerBiRows(), 'Schedule All Monitoring': scheduleRows(), 'Lab Invoice Tracker': labRows(), 'Tracker Lists': listsRows(), 'Project Management': contactRows(), 'Billability Overrides': overrideRows(), Notes: [['just', 'text']] }));
    expect(planKinds(plan).sort()).toEqual(['contacts', 'effort', 'labInvoices', 'lists', 'overrides', 'powerBi', 'schedule']);
    expect(plan.ignored).toEqual(['Notes']);
  });

  it('reads the Effort Report: dates, billability from Effort Logic, people and suppliers', () => {
    const plan = analyseWorkbook('effort.xlsx', workbook({ 'Effort Report': effortRows() }));
    const t = plan.effort!.transactions;
    expect(t).toHaveLength(6);
    const byId = new Map(t.map((x) => [x.id, x]));
    expect(byId.get('1001')!.date).toBe('2026-09-10');
    expect(byId.get('1001')!.sourceBillable).toBe(true);
    expect(byId.get('1002')!.sourceBillable).toBe(false); // Non Billable Effort Logic
    expect(byId.get('1004')!.supplier).toBe('R J HILL LABORATORIES LIMITED');
    expect(byId.get('1004')!.uom).toBe('CURRENCY');
    expect(byId.get('1003')!.invoicingStatus).toBe('Fully invoiced');
    expect(byId.get('2001')!.effort).toBe(375);
    expect(plan.effort!.projects.map((p) => p.id).sort()).toEqual([P1, P2].sort());
    expect(plan.effort!.projects.find((p) => p.id === P2)!.manager).toBe('Brown, Alex');
  });

  it('reads the Power BI export and skips the filters note', () => {
    const plan = analyseWorkbook('data.xlsx', workbook({ Export: powerBiRows() }));
    expect(plan.powerBi!.rows).toHaveLength(2);
    const p1 = plan.powerBi!.rows.find((r) => r.id === P1)!;
    expect(p1.fin.budgetCost).toBe(70000);
    expect(p1.fin.actualNM).toBe(0.2);
    expect(p1.fin.itdRevenue).toBe(60000); // the heading has a trailing space in the export
    expect(p1.fin.remainingBudget).toBe(35000);
  });

  it('reads the monitoring schedule and leaves the legend out', () => {
    const plan = analyseWorkbook('mon.xlsx', workbook({ 'Schedule All Monitoring': scheduleRows() }));
    expect(plan.schedule!.rows.map((r) => r.name)).toEqual(['Burma Rd Closed Landfill', 'Other Landfill']);
    const burma = plan.schedule!.rows[0];
    expect(burma.months[0]).toBe('▲#');
    expect(burma.months[2]).toBe('●');
    expect(burma.months[1]).toBe('');
    expect(burma.annualReportDue).toBe('January');
    expect(plan.schedule!.rows[1].po).toBe('P100001NZ001');
    expect(plan.schedule!.rows[1].folder).toBe('G:\\somewhere');
  });

  it('reads the lab invoice tracker with a status for each row', () => {
    const plan = analyseWorkbook('mon.xlsx', workbook({ 'Lab Invoice Tracker': labRows() }));
    const inv = plan.labInvoices!.invoices;
    expect(inv).toHaveLength(3);
    expect(inv[0].status).toBe('sent');
    expect(inv[0].sentToAp).toBe('2026-09-29');
    expect(inv[0].amount).toBe(2490.16);
    expect(inv[0].invoiceNo).toBe('4304935');
    expect(inv[1].status).toBe('received');
    expect(inv[2].status).toBe('awaiting');
  });
});

describe('applying a plan', () => {
  let db: PmDatabase;
  beforeEach(() => {
    db = new PmDatabase(`test-${Math.random()}`);
  });

  it('writes projects, transactions and money, and marks my projects as mine', async () => {
    const plan = analyseWorkbook('tracker.xlsx', workbook({ 'Effort Report': effortRows(), Export: powerBiRows() }));
    const r = await applyPlan(plan, settings, db);
    expect(r.counts.transactions).toBe(6);
    const p1 = (await db.projects.get(P1))!;
    expect(p1.mine).toBe(true);
    expect(p1.fin?.budgetCost).toBe(70000);
    expect(p1.aliases).toContain('2-11111.00');
    const p2 = (await db.projects.get(P2))!;
    expect(p2.mine).toBe(false);
    expect(await db.transactions.count()).toBe(6);
  });

  it('keeps my choices when a fresh export comes in, and updates statuses', async () => {
    await applyPlan(analyseWorkbook('a.xlsx', workbook({ 'Effort Report': effortRows() })), settings, db);
    await db.overrides.put({ id: '1001', projectId: P1, billable: false, at: 'now' });
    await db.projects.update(P2, { mine: true });
    // the next export: 1001 is now invoiced
    const rows = effortRows();
    const i = rows[0].indexOf('Transaction Invoicing Status');
    rows[1][i] = 'Fully invoiced';
    await applyPlan(analyseWorkbook('b.xlsx', workbook({ 'Effort Report': rows })), settings, db);
    expect(await db.transactions.count()).toBe(6);
    expect((await db.transactions.get('1001'))!.invoicingStatus).toBe('Fully invoiced');
    expect((await db.overrides.get('1001'))!.billable).toBe(false);
    expect((await db.projects.get(P2))!.mine).toBe(true);
  });

  it('matches schedule rows, lab invoices and contacts to projects by code', async () => {
    const plan = analyseWorkbook('all.xlsx', workbook({ 'Effort Report': effortRows(), 'Schedule All Monitoring': scheduleRows(), 'Lab Invoice Tracker': labRows(), 'Tracker Lists': listsRows(), 'Project Management': contactRows(), 'Billability Overrides': overrideRows() }));
    await applyPlan(plan, settings, db);
    const rows = await db.scheduleRows.toArray();
    expect(rows.find((r) => r.name === 'Burma Rd Closed Landfill')!.projectId).toBe(P1);
    expect(rows.find((r) => r.name === 'Other Landfill')!.projectId).toBe(P2);
    const inv = await db.labInvoices.toArray();
    expect(inv.every((i) => i.projectId)).toBe(true);
    expect(inv.find((i) => i.invoiceNo === '4303765')!.projectId).toBe(P2);
    const p2 = (await db.projects.get(P2))!;
    expect(p2.clientContact).toBe('A Person');
    expect(p2.po).toBe('P100001NZ001');
    expect(p2.clientReference).toBe('CM688');
    // only the saved Y/N choices come across
    const o = await db.overrides.toArray();
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ id: '1001', billable: false, projectId: P1 });
  });

  it('keeps the calendar marks when the schedule is imported again', async () => {
    await applyPlan(analyseWorkbook('a.xlsx', workbook({ 'Schedule All Monitoring': scheduleRows() })), settings, db);
    const row = (await db.scheduleRows.toArray()).find((r) => r.name === 'Burma Rd Closed Landfill')!;
    await db.scheduleMarks.put({ id: `${row.id}|2026-03`, rowId: row.id, year: 2026, month: 3, status: 'done', at: 'now' });
    await applyPlan(analyseWorkbook('b.xlsx', workbook({ 'Schedule All Monitoring': scheduleRows() })), settings, db);
    const again = (await db.scheduleRows.toArray()).find((r) => r.name === 'Burma Rd Closed Landfill')!;
    expect(again.id).toBe(row.id);
    expect((await db.scheduleMarks.toArray()).map((m) => m.status)).toEqual(['done']);
  });
});

describe('is it me', () => {
  it('matches the name however the export writes it', () => {
    expect(isMe('Foote, Benjamin', 'Foote, Benjamin')).toBe(true);
    expect(isMe('Foote Benjamin Colin', 'Foote, Benjamin')).toBe(true);
    expect(isMe('Benjamin Foote', 'Foote, Benjamin')).toBe(true);
    expect(isMe('Foote, Benjamin', 'Smith, Jane')).toBe(false);
    expect(isMe('Foote, Benjamin', '')).toBe(false);
  });
});
