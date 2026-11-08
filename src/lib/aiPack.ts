// A project written out as Markdown, to paste into an AI assistant and ask questions about it.

import type { BillingCycle, LabInvoice, Project, Settings, Transaction } from '../db/types';
import { byMonth, byPerson, byTask, isBillable, isUnbilled, pendingChanges, type OverrideMap } from './billability';
import { BILLING_STEPS, currentBillingMonth } from './billing';
import { addMonths, formatDate, formatMonth, monthOf, todayStr } from './dates';
import { money, num, pct, shortName } from './format';
import { HEALTH_META, projectHealth } from './health';
import { billingMode, taskClaims } from './tasks';

export interface PackOptions {
  /** Every transaction line, or only the summaries. */
  transactions: boolean;
  /** Only this many months back (0 = everything). */
  months: number;
  /** People's names as initials, suppliers as "Supplier"; the project's client and PM stay. */
  anonymise: boolean;
  comments: boolean;
  labInvoices: boolean;
}

export const DEFAULT_PACK: PackOptions = { transactions: true, months: 0, anonymise: false, comments: true, labInvoices: false };

export interface PackInput {
  project: Project;
  txns: Transaction[];
  overrides: OverrideMap;
  cycles: BillingCycle[];
  labInvoices?: LabInvoice[];
  settings: Settings;
  today?: string;
}

const cell = (v: unknown) =>
  String(v ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();

function table(header: string[], rows: unknown[][]): string {
  if (!rows.length) return '_none_\n';
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

/** "Foote, Benjamin (Ben)" → "B.F."; a supplier → "Supplier 1", the same every time. */
function anonymiser() {
  const seen = new Map<string, string>();
  let suppliers = 0;
  return (name: string | undefined, kind: 'person' | 'supplier'): string => {
    if (!name) return '';
    if (seen.has(name)) return seen.get(name)!;
    let out: string;
    if (kind === 'supplier') out = `Supplier ${++suppliers}`;
    else {
      const [last, rest] = name.split(',').map((s) => s.trim());
      const first = (rest ?? '').replace(/\(.*\)/, '').trim().split(/\s+/)[0] ?? '';
      out = `${first[0] ?? ''}${first ? '.' : ''}${last?.[0] ?? ''}.`.toUpperCase();
      if ([...seen.values()].includes(out)) out = `${out}${seen.size}`;
    }
    seen.set(name, out);
    return out;
  };
}

export function buildProjectPack(input: PackInput, opts: PackOptions = DEFAULT_PACK): string {
  const { project: p, overrides, cycles, settings } = input;
  const today = input.today ?? todayStr();
  const anon = anonymiser();
  const who = (t: Transaction) => (t.person ? (opts.anonymise ? anon(t.person, 'person') : t.person) : t.supplier ? (opts.anonymise ? anon(t.supplier, 'supplier') : t.supplier) : t.type);
  const from = opts.months > 0 ? addMonths(monthOf(today), -(opts.months - 1)) : '0000-00';
  const txns = input.txns.filter((t) => monthOf(t.date) >= from).sort((a, b) => a.date.localeCompare(b.date));
  const all = input.txns;
  const h = projectHealth(p, all, overrides, settings);
  const t = h.totals;
  const dates = all.map((x) => x.date).sort();
  const mode = billingMode(p);
  const fin = p.fin;
  const L: string[] = [];

  L.push(`# ${shortName(p.name)} – project briefing`);
  L.push('');
  L.push(`_Prepared ${formatDate(today)} by PM Toolbox. Money in NZD excl. GST. "Billable" and "non-billable" are as the project manager has them set, which can differ from the finance system's export._`);
  L.push('');
  L.push('## How to use this');
  L.push('You are helping a project manager understand and manage this project. Use only the data below. When asked, point out risks (budget, margin, unbilled work, non-billable time), explain what the numbers mean, suggest what to bill this month, and draft e-mails or notes. Be concrete and cite the figures you use.');
  L.push('');
  L.push('## Project');
  L.push(table(['Field', 'Value'], [
    ['Project number', p.id],
    ['Name', p.name],
    ['Client', p.customer ?? ''],
    ['Project manager', p.manager ?? ''],
    ['Financial advisor', p.financialAdvisor ?? ''],
    ['Status', p.status],
    ['Bill plan (finance system)', p.billPlanMethod ?? ''],
    ['Billed here as', mode === 'task' ? 'per task (% of each task’s quoted fee)' : 'time & costs (hours and expenses line by line)'],
    ['Contract', p.contractNumber ?? ''],
    ['Client reference / PO', p.clientReference ?? ''],
    ['Consents', p.consents ?? ''],
    ['Notes', p.notes ?? ''],
  ].filter((r) => r[1] !== '')));

  L.push('## Money (finance system, Power BI)');
  if (fin) {
    L.push(`_As at ${formatDate(fin.asOf)}._`);
    L.push('');
    L.push(table(['Measure', 'Value'], [
      ['Fee type', fin.feeType],
      ['Budget revenue', money(fin.budgetRevenue)],
      ['Revenue to date', money(fin.itdRevenue)],
      ['Revenue % complete', pct(fin.revenuePct)],
      ['Budget cost', money(fin.budgetCost)],
      ['Actual cost', money(fin.actualCost)],
      ['% of cost budget spent', pct(fin.costPct)],
      ['Budget net margin', pct(fin.budgetNM)],
      ['Actual net margin', pct(fin.actualNM)],
      ['Budget DLM (multiplier)', num(fin.budgetDLM)],
      ['Actual DLM', num(fin.actualDLM)],
      ['Invoiced to date', money(fin.itdInvoiced)],
      ['Total WIP (unbilled)', money(fin.totalWIP)],
      ['Total AR (invoiced, unpaid)', money(fin.totalAR)],
      ['Collections', money(fin.collection)],
      ['Effort to date (bill value)', money(fin.itdEffort)],
      ['Remaining budget (on effort)', money(fin.remainingBudget)],
    ].filter((r) => r[1] !== undefined && r[1] !== '–')));
  } else L.push('_No Power BI money imported for this project._\n');

  L.push('## Health');
  L.push(`**${HEALTH_META[h.level].label}**${h.reasons.length ? ': ' + h.reasons.join('; ') : ''}.`);
  L.push(`Thresholds: watch at ${settings.budgetWarnPct}% of cost budget, at risk at ${settings.budgetDangerPct}%, margin warning below ${settings.marginWarnPct}%.`);
  L.push('');

  L.push('## Time and cost from the Effort Report (all months imported)');
  L.push(table(['Measure', 'Value'], [
    ['Transactions', t.count],
    ['Hours', num(t.hours, 2)],
    ['Billable hours', num(t.billableHours, 2)],
    ['Non-billable hours', `${num(t.nonBillableHours, 2)} (${pct(t.nonBillablePct)})`],
    ['Burdened cost', money(t.cost, true)],
    ['of which expenses, lab, km', money(t.expenses, true)],
    ['Billable amount (bill value)', money(t.billableEffort, true)],
    ['Billable amount the PM has turned off', money(t.turnedOff, true)],
    ['Not yet invoiced (billable)', `${money(t.unbilledEffort, true)} (${num(t.unbilledHours, 2)} h)`],
    ['Margin on effort (bill value − cost)', money(t.margin, true)],
    ['Effective rate on billable hours', `${money(t.effectiveRate)}/h`],
    ['First / last transaction', all.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : '–'],
  ]));

  L.push('## By month');
  L.push(table(['Month', 'Hours', 'Billable h', 'Non-billable h', 'Cost', 'Billable amount', 'Not yet invoiced'], byMonth(all, overrides).map((g) => [formatMonth(g.key), num(g.totals.hours, 2), num(g.totals.billableHours, 2), num(g.totals.nonBillableHours, 2), money(g.totals.cost), money(g.totals.billableEffort), money(g.totals.unbilledEffort)])));

  L.push('## By person / resource');
  L.push(table(['Person / resource', 'Hours', 'Billable h', 'Non-billable h', 'NB %', 'Cost', 'Billable amount', 'Effective rate', 'Margin', 'Not yet invoiced'], byPerson(all, overrides).map((g) => {
    const first = g.txns[0];
    return [who(first), num(g.totals.hours, 2), num(g.totals.billableHours, 2), num(g.totals.nonBillableHours, 2), pct(g.totals.nonBillablePct), money(g.totals.cost), money(g.totals.billableEffort), g.totals.billableHours ? money(g.totals.effectiveRate) : '–', money(g.totals.margin), money(g.totals.unbilledEffort)];
  })));

  L.push('## By task');
  if (mode === 'task') {
    const claims = taskClaims(p, addMonths(currentBillingMonth(today), 1), cycles, all);
    L.push(table(['Task', 'Quoted fee', 'Claimed %', 'Claimed to date', 'Fee left', 'Hours', 'Cost to date', 'Cost vs fee'], claims.map((c) => [`${c.taskName} (${c.taskNumber})`, c.fee ? money(c.fee) : 'not set', pct(c.pct, false), money(c.claimedToDate), money(c.remaining), num(c.hoursToDate, 2), money(c.costToDate), c.fee ? pct(c.costToDate / c.fee) : '–'])));
  } else {
    L.push(table(['Task', 'Hours', 'Billable h', 'Non-billable h', 'Cost', 'Billable amount', 'Margin', 'Not yet invoiced'], byTask(all, overrides).map((g) => [g.label, num(g.totals.hours, 2), num(g.totals.billableHours, 2), num(g.totals.nonBillableHours, 2), money(g.totals.cost), money(g.totals.billableEffort), money(g.totals.margin), money(g.totals.unbilledEffort)])));
  }

  L.push('## Monthly billing record');
  const mine = cycles.filter((c) => c.projectId === p.id).sort((a, b) => a.month.localeCompare(b.month));
  L.push(table(['Month', 'Steps done', 'Invoice amount', 'Invoice #', 'Task % claimed', 'Notes'], mine.map((c) => [formatMonth(c.month), c.skipped ? 'Nothing to bill' : BILLING_STEPS.filter((s) => c.steps[s.key]).map((s) => `${s.label} (${formatDate(c.steps[s.key]!.slice(0, 10))})`).join(', ') || 'not started', c.invoiceAmount !== undefined ? money(c.invoiceAmount, true) : '', c.invoiceNumber ?? '', c.taskProgress ? Object.entries(c.taskProgress).map(([k, v]) => `${k}: ${v}%`).join(', ') : '', c.notes ?? ''])));
  L.push(`The month being billed now is ${formatMonth(currentBillingMonth(today), true)} (due by the ${settings.billingDueDay}th of the following month).`);
  L.push('');

  const pending = pendingChanges(all, overrides);
  L.push('## Billability changes the PM has made (differ from the finance system)');
  L.push(table(['Txn #', 'Date', 'Who', 'Task', 'Bill amount', 'Now', 'Note'], pending.map(({ txn, override }) => [txn.id, formatDate(txn.date), who(txn), txn.taskName, money(txn.effort, true), override.billable ? 'billable' : 'non-billable', override.note ?? ''])));

  if (opts.labInvoices && input.labInvoices?.length) {
    const inv = input.labInvoices.filter((i) => i.projectId === p.id).sort((a, b) => (a.invoiceDate ?? '').localeCompare(b.invoiceDate ?? ''));
    L.push('## Lab invoices');
    L.push(table(['Round', 'Type', 'Lab', 'Invoice #', 'Invoice date', 'Amount', 'Status', 'Sent to AP'], inv.map((i) => [formatDate(i.roundDate), i.roundType ?? '', i.lab ?? '', i.invoiceNo ?? '', formatDate(i.invoiceDate), money(i.amount, true), i.status, formatDate(i.sentToAp)])));
  }

  if (opts.transactions) {
    L.push(`## Every transaction${opts.months > 0 ? ` (last ${opts.months} months)` : ''}`);
    L.push(`_${txns.length} lines. Qty is hours for labour, km for vehicle use, and the amount for expenses. "Invoicing" is the finance system's status; "Billable" is as set by the PM._`);
    L.push('');
    const header = ['Date', 'Who', 'Task', 'Type', 'Qty', 'Unit', 'Cost', 'Bill amount', 'Invoicing', 'Billable', 'Txn #'];
    if (opts.comments) header.push('Comment');
    L.push(table(header, txns.map((x) => {
      const r: unknown[] = [x.date, who(x), x.taskName, x.type, num(x.quantity, 2), x.uom, num(x.cost, 2), num(x.effort, 2), isUnbilled(x) ? 'uninvoiced' : 'invoiced', isBillable(x, overrides) ? 'Y' : 'N', x.id];
      if (opts.comments) r.push(x.comment ?? '');
      return r;
    })));
  }

  L.push('## Questions worth asking');
  L.push([
    '- How is this project tracking against its budget and margin, and what is driving any gap?',
    '- What should be invoiced this month, and is anything old still unbilled?',
    '- Which people or tasks are costing more than they bring in, and why might that be?',
    '- Which non-billable hours could reasonably be billed, and which billable ones look doubtful?',
    '- Draft a short status note for the client / my manager from these figures.',
    '- What would you watch for next month?',
  ].join('\n'));
  L.push('');
  return L.join('\n');
}

/** Rough size, for the preview: characters and about how many tokens an assistant would count. */
export const packSize = (s: string) => ({ chars: s.length, tokens: Math.round(s.length / 3.6) });
