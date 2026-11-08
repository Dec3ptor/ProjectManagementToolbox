import { describe, expect, it } from 'vitest';
import type { BillingCycle, Project, Transaction } from '../src/db/types';
import { buildProjectPack, DEFAULT_PACK } from '../src/lib/aiPack';
import { overrideMap } from '../src/lib/billability';
import { DEFAULT_SETTINGS } from '../src/db/db';

const project = (o: Partial<Project> & { id: string }): Project => ({ name: o.id, status: 'active', mine: true, aliases: [], createdAt: '', updatedAt: '', ...o });
const txn = (o: Partial<Transaction> & { id: string }): Transaction => ({ projectId: 'P', taskNumber: '001', taskName: 'Report', billableTask: true, category: 'Labor', type: 'Regular Hours', date: '2026-09-10', invoicingStatus: 'Uninvoiced', quantity: 1, uom: 'HOURS', cost: 100, effort: 150, sourceBillable: true, importId: 'i', person: 'Foote, Benjamin (Ben)', ...o });

describe('the project briefing for an AI assistant', () => {
  const p = project({ id: 'NZL-WSP-2-11111.00', name: 'Test Monitoring NZL-WSP-2-11111.00', customer: 'Test Council', manager: 'Foote, Benjamin', billPlanMethod: 'Bill Rate Invoice', fin: { asOf: '2026-10-26', budgetCost: 1000, actualCost: 900, actualNM: 0.25, totalWIP: 300 } });
  const txns = [txn({ id: '1', comment: 'Wrote the report | carefully' }), txn({ id: '2', date: '2026-05-02', person: 'Jones, Sam (Sam)', comment: 'old' }), txn({ id: '3', person: undefined, supplier: 'R J HILL LABORATORIES LIMITED', uom: 'CURRENCY', quantity: 500, cost: 500, effort: 550, type: 'Laboratory Costs' })];
  const overrides = overrideMap([{ id: '1', projectId: p.id, billable: false, note: 'PM time', at: '' }]);
  const cycles: BillingCycle[] = [{ id: '2026-08|' + p.id, month: '2026-08', projectId: p.id, steps: { reviewed: '2026-09-02T00:00:00Z', invoiced: '2026-09-05T00:00:00Z' }, invoiceAmount: 1234, invoiceNumber: 'INV-1', updatedAt: '' }];
  const input = { project: p, txns, overrides, cycles, settings: DEFAULT_SETTINGS, today: '2026-10-26' };

  it('writes the project, money, health, people, tasks, billing and lines as Markdown', () => {
    const s = buildProjectPack(input);
    expect(s).toContain('# Test Monitoring – project briefing');
    expect(s).toContain('| Project number | NZL-WSP-2-11111.00 |');
    expect(s).toContain('| Budget cost | $1,000 |');
    expect(s).toContain('**Watch**: 90% of the cost budget spent');
    expect(s).toContain('| Foote, Benjamin (Ben) |');
    expect(s).toContain('| R J HILL LABORATORIES LIMITED |');
    expect(s).toContain('| Aug 2026 | Time reviewed (2 Sep 2026), Invoiced (5 Sep 2026) | $1,234.00 | INV-1 |');
    // the override shows as a change and on the line
    expect(s).toContain('| 1 | 10 Sep 2026 | Foote, Benjamin (Ben) | Report | $150.00 | non-billable | PM time |');
    expect(s).toMatch(/\| 2026-09-10 \| Foote, Benjamin \(Ben\) \| Report \| Regular Hours \| 1 \| HOURS \| 100 \| 150 \| uninvoiced \| N \| 1 \| Wrote the report \\\| carefully \|/);
  });

  it('can leave the lines out, shorten the period and hide names', () => {
    const summary = buildProjectPack(input, { ...DEFAULT_PACK, transactions: false });
    expect(summary).not.toContain('## Every transaction');
    expect(summary).toContain('## By person');
    const recent = buildProjectPack(input, { ...DEFAULT_PACK, months: 3 });
    expect(recent).toContain('(last 3 months)');
    expect(recent).not.toContain('| 2026-05-02 |');
    expect(recent).toContain('| 2026-09-10 |');
    const anon = buildProjectPack(input, { ...DEFAULT_PACK, anonymise: true });
    expect(anon).not.toContain('Foote, Benjamin (Ben)');
    expect(anon).not.toContain('HILL LABORATORIES');
    expect(anon).toContain('| B.F. |');
    expect(anon).toContain('| S.J. |');
    expect(anon).toContain('| Supplier 1 |');
    // the client and the PM's own name stay: they are the project's, not the team's
    expect(anon).toContain('| Client | Test Council |');
  });

  it('writes a per-task project’s fees and claims', () => {
    const pt = { ...p, billingMode: 'task' as const, taskFees: [{ taskNumber: '001', taskName: 'Report', fee: 5000 }] };
    const c: BillingCycle = { id: '2026-09|' + p.id, month: '2026-09', projectId: p.id, steps: {}, taskProgress: { '001': 40 }, updatedAt: '' };
    const s = buildProjectPack({ ...input, project: pt, cycles: [c] });
    expect(s).toContain('per task (% of each task’s quoted fee)');
    expect(s).toContain('| Report (001) | $5,000 | 40% | $2,000 | $3,000 |');
    expect(s).toContain('| Sep 2026 | not started |  |  | 001: 40% |');
  });
});
