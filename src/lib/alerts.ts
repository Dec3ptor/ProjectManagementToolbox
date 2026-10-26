// What needs attention: billing due, lab invoices waiting, projects in trouble, monitoring this month, reports due.

import type { BillingCycle, ImportBatch, LabInvoice, Project, ScheduleMark, ScheduleRow, Settings, Todo, Transaction } from '../db/types';
import { type OverrideMap } from './billability';
import { billingDueDate, currentBillingMonth, monthBilling } from './billing';
import { addMonths, daysBetween, formatDate, formatMonth, monthFromText, monthOf, todayStr } from './dates';
import { money, plural, shortName } from './format';
import { projectHealth, HEALTH_META } from './health';
import { scheduledItems } from './schedule';

export type Severity = 'critical' | 'warning' | 'info';
export type AlertKind = 'billing' | 'lab' | 'project' | 'monitoring' | 'report' | 'todo' | 'data';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  title: string;
  detail?: string;
  link: string;
  /** The date it is due, when it has one. */
  due?: string;
  projectId?: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export const KIND_META: Record<AlertKind, { label: string; color: string }> = {
  billing: { label: 'Billing', color: 'indigo' },
  lab: { label: 'Lab invoice', color: 'violet' },
  project: { label: 'Project', color: 'orange' },
  monitoring: { label: 'Monitoring', color: 'cyan' },
  report: { label: 'Report', color: 'grape' },
  todo: { label: 'To do', color: 'blue' },
  data: { label: 'Data', color: 'gray' },
};

export interface AlertInput {
  projects: Project[];
  txns: Transaction[];
  overrides: OverrideMap;
  cycles: BillingCycle[];
  labInvoices: LabInvoice[];
  rows: ScheduleRow[];
  marks: ScheduleMark[];
  todos: Todo[];
  imports: ImportBatch[];
  settings: Settings;
  today?: string;
}

export function buildAlerts(input: AlertInput): Alert[] {
  const today = input.today ?? todayStr();
  const s = input.settings;
  const out: Alert[] = [];
  const mine = input.projects.filter((p) => p.mine && p.status === 'active');

  // ---- billing: the month just ended, for each of my projects
  const month = currentBillingMonth(today);
  const due = billingDueDate(month, s);
  const late = today > due;
  for (const b of monthBilling(month, input.projects, input.txns, input.overrides, input.cycles)) {
    if (b.done) continue;
    const amount = b.thisMonthEffort + b.olderEffort;
    if (amount <= 0 && !b.nonBillable.length && !b.fixedFee) continue;
    if (b.fixedFee && b.thisMonthEffort <= 0 && !b.nonBillable.length) continue;
    const started = (b.cycle && Object.keys(b.cycle.steps).length) || 0;
    const what = b.fixedFee ? `${money(b.thisMonthEffort)} of work this month – fixed fee, invoice by % complete` : `${money(amount)} billable not yet invoiced${b.olderEffort > 0 ? ` (${money(b.olderEffort)} from earlier months)` : ''}`;
    out.push({
      id: `billing|${month}|${b.project.id}`,
      kind: 'billing',
      severity: late ? 'critical' : daysBetween(today, due) <= 3 ? 'warning' : 'info',
      title: `${formatMonth(month)} billing: ${shortName(b.project.name)}`,
      detail: `${what}${started ? ` · ${started} of 4 steps done` : ''} · due ${formatDate(due)}${late ? ' – overdue' : ''}`,
      link: `/billing/${month}`,
      due,
      projectId: b.project.id,
    });
  }

  // ---- lab invoices waiting to go to AP, or still to arrive
  for (const inv of input.labInvoices) {
    if (inv.status === 'received') {
      const since = inv.invoiceDate ? daysBetween(inv.invoiceDate, today) : 0;
      out.push({
        id: `lab|${inv.id}`,
        kind: 'lab',
        severity: since > s.apOverdueDays ? 'critical' : since > s.apOverdueDays / 2 ? 'warning' : 'info',
        title: `Lab invoice ${inv.invoiceNo ?? inv.labRef ?? ''} not yet sent to AP`,
        detail: `${inv.projectName}${inv.amount ? ` · ${money(inv.amount, true)}` : ''}${inv.invoiceDate ? ` · ${plural(since, 'day')} since the invoice` : ''}${inv.po ? '' : ' · no PO yet'}`,
        link: `/lab-invoices`,
        due: inv.invoiceDate,
        projectId: inv.projectId,
      });
    } else if (inv.status === 'awaiting' && inv.roundDate && daysBetween(inv.roundDate, today) > 30) {
      out.push({
        id: `lab|${inv.id}`,
        kind: 'lab',
        severity: 'warning',
        title: `No lab invoice yet for ${inv.projectName}`,
        detail: `${inv.roundType ?? 'Monitoring round'} on ${formatDate(inv.roundDate)} – ${plural(daysBetween(inv.roundDate, today), 'day')} ago. Chase the lab or check the inbox.`,
        link: `/lab-invoices`,
        projectId: inv.projectId,
      });
    } else if (inv.status === 'query') {
      out.push({ id: `lab|${inv.id}`, kind: 'lab', severity: 'warning', title: `Lab invoice ${inv.invoiceNo ?? ''} on hold / queried`, detail: `${inv.projectName}${inv.notes ? ` · ${inv.notes.slice(0, 120)}` : ''}`, link: `/lab-invoices`, projectId: inv.projectId });
    }
  }

  // ---- projects in trouble
  const byProject = new Map<string, Transaction[]>();
  for (const t of input.txns) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  for (const p of mine) {
    const h = projectHealth(p, byProject.get(p.id) ?? [], input.overrides, s);
    if (h.level === 'critical' || h.level === 'serious' || h.level === 'warning') {
      out.push({
        id: `project|${p.id}`,
        kind: 'project',
        severity: h.level === 'critical' ? 'critical' : h.level === 'serious' ? 'warning' : 'info',
        title: `${shortName(p.name)}: ${HEALTH_META[h.level].label.toLowerCase()}`,
        detail: h.reasons.slice(0, 3).join(' · '),
        link: `/projects/${encodeURIComponent(p.id)}`,
        projectId: p.id,
      });
    }
  }

  // ---- monitoring this month and next (what's on the schedule and not done), and annual reports due
  const [y, m] = today.split('-').map(Number);
  const nextMonth = addMonths(monthOf(today), 1);
  const [ny, nm] = nextMonth.split('-').map(Number);
  const items = [...scheduledItems(input.rows, input.marks, y).filter((i) => i.month === m), ...(ny === y ? scheduledItems(input.rows, input.marks, y) : scheduledItems(input.rows, input.marks, ny)).filter((i) => i.month === nm)];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${it.row.id}|${it.year}-${it.month}`;
    if (seen.has(key) || it.status === 'done' || it.status === 'cancelled') continue;
    seen.add(key);
    const thisMonth = it.year === y && it.month === m;
    out.push({
      id: `monitoring|${key}`,
      kind: 'monitoring',
      severity: it.status === 'doing' ? 'warning' : thisMonth ? 'info' : 'info',
      title: `${it.row.name}: ${it.status === 'doing' ? 'results to analyse / send' : thisMonth ? 'monitoring this month' : 'monitoring next month'}`,
      detail: [it.cell.trim(), it.row.details].filter(Boolean).join(' – ').slice(0, 160),
      link: `/calendar/${it.year}`,
      due: `${it.year}-${String(it.month).padStart(2, '0')}-${thisMonth ? '28' : '01'}`,
      projectId: it.row.projectId,
    });
  }
  const reportRows = new Set<string>();
  for (const row of input.rows) {
    const rm = monthFromText(row.annualReportDue);
    if (!rm || reportRows.has(row.name + rm)) continue;
    reportRows.add(row.name + rm);
    const inWindow = rm === m || rm === nm;
    if (!inWindow) continue;
    out.push({
      id: `report|${row.id}|${rm}`,
      kind: 'report',
      severity: rm === m ? 'warning' : 'info',
      title: `${row.name}: annual report due ${rm === m ? 'this month' : 'next month'}`,
      detail: row.annualReportDue,
      link: `/calendar/${y}`,
      due: `${rm === m ? y : ny}-${String(rm).padStart(2, '0')}-28`,
      projectId: row.projectId,
    });
  }

  // ---- my own to-dos
  for (const t of input.todos) {
    if (t.done) continue;
    if (!t.due) continue;
    const d = daysBetween(today, t.due);
    if (d > 14) continue;
    out.push({ id: `todo|${t.id}`, kind: 'todo', severity: d < 0 ? 'critical' : d <= 3 ? 'warning' : 'info', title: t.title, detail: d < 0 ? `${plural(-d, 'day')} overdue` : d === 0 ? 'Due today' : `Due ${formatDate(t.due)}`, link: '/', due: t.due, projectId: t.projectId });
  }

  // ---- stale data
  const lastEffort = input.imports.filter((i) => i.kinds.includes('effort')).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (input.txns.length && (!lastEffort || daysBetween(lastEffort.at.slice(0, 10), today) > s.staleImportDays)) {
    out.push({ id: 'data|effort', kind: 'data', severity: 'info', title: 'Import a fresh Effort Report', detail: lastEffort ? `The last one was ${formatDate(lastEffort.at.slice(0, 10))}.` : 'None imported yet.', link: '/import' });
  }
  if (!input.txns.length && !input.projects.length) out.push({ id: 'data|none', kind: 'data', severity: 'info', title: 'Start by importing your Effort Report and Power BI export', link: '/import' });

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.due ?? '9').localeCompare(b.due ?? '9'));
}
