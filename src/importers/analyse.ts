// What a workbook holds: an Effort Report, a Power BI export, the monitoring schedule, the lab invoice tracker,
// the tracker lists, client details, saved billability overrides – any of them, in any sheet, in one file.

import type { LabInvoice, LabInvoiceStatus, Project, ProjectFinancials, ScheduleRow, Transaction } from '../db/types';
import { sourceBillable } from '../lib/billability';
import { nowIso, parseDate } from '../lib/dates';
import { text, toNumber, uid } from '../lib/format';
import { columnIndex, findHeaderRow, type SheetRows } from './xlsx';

export interface EffortPlan {
  sheet: string;
  transactions: Transaction[];
  /** Projects the report mentions, with what it says about them. */
  projects: Array<Pick<Project, 'id' | 'name' | 'customer' | 'manager' | 'financialAdvisor' | 'billPlanMethod' | 'contractNumber'> & { status: string }>;
}

export interface PowerBiPlan {
  sheet: string;
  asOf: string;
  rows: Array<{ id: string; name: string; manager?: string; financialAdvisor?: string; fin: ProjectFinancials }>;
}

export interface SchedulePlan {
  sheet: string;
  rows: ScheduleRow[];
}

export interface LabInvoicePlan {
  sheet: string;
  invoices: LabInvoice[];
}

export interface ListPlan {
  sheet: string;
  /** Project name → job code and PO. */
  rows: Array<{ name: string; jobCode?: string; po?: string }>;
}

export interface ContactsPlan {
  sheet: string;
  rows: Array<{ name: string; projectNumber: string; po?: string; client?: string; contact?: string; email?: string; folder?: string }>;
}

export interface OverridesPlan {
  sheet: string;
  rows: Array<{ id: string; billable: boolean }>;
}

export interface ImportPlan {
  fileName: string;
  effort?: EffortPlan;
  powerBi?: PowerBiPlan;
  schedule?: SchedulePlan;
  labInvoices?: LabInvoicePlan;
  lists?: ListPlan;
  contacts?: ContactsPlan;
  overrides?: OverridesPlan;
  /** Sheets nothing was recognised in. */
  ignored: string[];
}

export const planKinds = (p: ImportPlan): string[] => (['effort', 'powerBi', 'schedule', 'labInvoices', 'lists', 'contacts', 'overrides'] as const).filter((k) => p[k]);

export function analyseWorkbook(fileName: string, sheets: SheetRows[], importId = uid()): ImportPlan {
  const plan: ImportPlan = { fileName, ignored: [] };
  for (const s of sheets) {
    const r = s.rows;
    let hit = false;
    if (!plan.effort && findHeaderRow(r, ['Project Number', 'Transaction Number', 'Effort Logic']) >= 0) {
      plan.effort = parseEffort(s, importId);
      hit = true;
    }
    if (!plan.powerBi && findHeaderRow(r, ['Project #', 'Current Budget Revenue']) >= 0) {
      plan.powerBi = parsePowerBi(s);
      hit = true;
    }
    if (!plan.schedule && findHeaderRow(r, ['Job Code', 'Monitoring Schedule']) >= 0) {
      plan.schedule = parseSchedule(s);
      hit = true;
    }
    if (!plan.labInvoices && findHeaderRow(r, ['Invoice No', 'Invoice Amount (excl GST)']) >= 0) {
      plan.labInvoices = parseLabInvoices(s);
      hit = true;
    }
    if (!plan.lists && findHeaderRow(r, ['Project (from Schedule)', 'Job Code']) >= 0) {
      plan.lists = parseLists(s);
      hit = true;
    }
    if (!plan.contacts && findHeaderRow(r, ['Project Number', 'Client Contact']) >= 0 && findHeaderRow(r, ['Transaction Number']) < 0) {
      plan.contacts = parseContacts(s);
      hit = true;
    }
    if (!plan.overrides && findHeaderRow(r, ['Transaction ID · saved', 'Override · Y/N']) >= 0) {
      plan.overrides = parseOverrides(s);
      hit = true;
    }
    if (!hit) plan.ignored.push(s.name);
  }
  return plan;
}

// ------------------------------------------------------------------ Effort Report

function parseEffort(s: SheetRows, importId: string): EffortPlan {
  const h = findHeaderRow(s.rows, ['Project Number', 'Transaction Number', 'Effort Logic']);
  const col = columnIndex(s.rows[h]);
  const c = {
    contractNumber: col('Contract Number'),
    customer: col('Contract Customer'),
    projectId: col('Project Number'),
    projectName: col('Project Name'),
    projectStatus: col('Project Status'),
    manager: col('Project Manager'),
    pfa: col('Project Financial Advisor'),
    taskNumber: col('Task Number'),
    taskName: col('Task Name'),
    billableTask: col('Billable Task'),
    txn: col('Transaction Number'),
    category: col('Expenditure Category'),
    type: col('Expenditure Type'),
    date: col('Expenditure Date'),
    weekEnding: col('Expenditure Week Ending Date'),
    period: col('Expenditure Reporting Period'),
    personNumber: col('Person Number'),
    person: col('Person Name'),
    grade: col('HCM Grade'),
    jobTitle: col('Job / Billing Title'),
    po: col('PO Number'),
    supplier: col('Supplier'),
    supplierInvoice: col('Supplier Invoice Number'),
    lastInvoicing: col('Last Invoicing'),
    invStatus: col('Transaction Invoicing Status'),
    projInvStatus: col('Project Invoice Status'),
    projInvNo: col('Project Invoice Number'),
    arInvNo: col('AR Invoice Number'),
    billPlan: col('Bill Plan Method'),
    effortLogic: col('Effort Logic'),
    qty: col('Quantity'),
    uom: col('Unit of Measure'),
    costRate: col('Burdened Cost Rate (Project Ledger Currency)'),
    cost: col('Burdened Cost (Project Ledger Currency)'),
    billRate: col('Bill Rate (Invoice Currency)'),
    effort: col('Effort (Invoice Currency)'),
    comment: col('Expenditure Comment'),
  };
  const get = (row: unknown[], i: number) => (i < 0 ? null : row[i]);
  const transactions: Transaction[] = [];
  const projects = new Map<string, EffortPlan['projects'][number]>();
  for (const row of s.rows.slice(h + 1)) {
    const projectId = text(get(row, c.projectId));
    const id = text(get(row, c.txn));
    if (!projectId || !id) continue;
    const date = parseDate(get(row, c.date));
    if (!date) continue;
    const effortLogic = text(get(row, c.effortLogic)) || undefined;
    const effort = toNumber(get(row, c.effort)) ?? 0;
    transactions.push({
      id,
      projectId,
      taskNumber: text(get(row, c.taskNumber)),
      taskName: text(get(row, c.taskName)),
      billableTask: /^y/i.test(text(get(row, c.billableTask))),
      category: text(get(row, c.category)),
      type: text(get(row, c.type)),
      date,
      weekEnding: parseDate(get(row, c.weekEnding)),
      period: text(get(row, c.period)) || undefined,
      person: text(get(row, c.person)) || undefined,
      personNumber: text(get(row, c.personNumber)) || undefined,
      grade: text(get(row, c.grade)) || undefined,
      jobTitle: text(get(row, c.jobTitle)) || undefined,
      supplier: text(get(row, c.supplier)) || undefined,
      supplierInvoice: text(get(row, c.supplierInvoice)) || undefined,
      poNumber: text(get(row, c.po)) || undefined,
      invoicingStatus: text(get(row, c.invStatus)) || 'Uninvoiced',
      projectInvoiceStatus: text(get(row, c.projInvStatus)) || undefined,
      projectInvoiceNumber: text(get(row, c.projInvNo)) || undefined,
      arInvoiceNumber: text(get(row, c.arInvNo)) || undefined,
      lastInvoicing: parseDate(get(row, c.lastInvoicing)),
      billPlanMethod: text(get(row, c.billPlan)) || undefined,
      effortLogic,
      quantity: toNumber(get(row, c.qty)) ?? 0,
      uom: text(get(row, c.uom)) || 'HOURS',
      costRate: toNumber(get(row, c.costRate)),
      cost: toNumber(get(row, c.cost)) ?? 0,
      billRate: toNumber(get(row, c.billRate)),
      effort,
      comment: text(get(row, c.comment)) || undefined,
      sourceBillable: sourceBillable(effortLogic, effort),
      importId,
    });
    if (!projects.has(projectId))
      projects.set(projectId, {
        id: projectId,
        name: text(get(row, c.projectName)) || projectId,
        customer: text(get(row, c.customer)) || undefined,
        manager: text(get(row, c.manager)) || undefined,
        financialAdvisor: text(get(row, c.pfa)) || undefined,
        billPlanMethod: text(get(row, c.billPlan)) || undefined,
        contractNumber: text(get(row, c.contractNumber)) || undefined,
        status: text(get(row, c.projectStatus)) || 'Active',
      });
  }
  return { sheet: s.name, transactions, projects: [...projects.values()] };
}

// ------------------------------------------------------------------ Power BI export

function parsePowerBi(s: SheetRows): PowerBiPlan {
  const h = findHeaderRow(s.rows, ['Project #', 'Current Budget Revenue']);
  const col = columnIndex(s.rows[h]);
  const n = (row: unknown[], name: string) => {
    const i = col(name);
    return i < 0 ? undefined : toNumber(row[i]);
  };
  const rows: PowerBiPlan['rows'] = [];
  const asOf = nowIso().slice(0, 10);
  for (const row of s.rows.slice(h + 1)) {
    const id = text(row[col('Project #')]);
    // the filters note at the foot of the export is not a project
    if (!id || /applied filters/i.test(id) || id.includes('\n')) continue;
    rows.push({
      id,
      name: text(row[col('Project Name')]) || id,
      manager: text(row[col('Project Manager')]) || undefined,
      financialAdvisor: text(row[col('Project Financial Advisor')]) || undefined,
      fin: {
        asOf,
        feeType: text(row[col('Fee Type')]) || undefined,
        budgetRevenue: n(row, 'Current Budget Revenue'),
        itdRevenue: n(row, 'ITD Revenue'),
        revenuePct: n(row, 'Revenue % Complete'),
        budgetCost: n(row, 'Current Budget Cost'),
        actualCost: n(row, 'Actual Cost'),
        costPct: n(row, '% Spent (Cost)'),
        budgetNM: n(row, 'Current Budget NM %'),
        actualNM: n(row, 'Actual NM %'),
        budgetDLM: n(row, 'Current Budget DLM'),
        actualDLM: n(row, 'Actual DLM'),
        totalAR: n(row, 'Total AR'),
        collection: n(row, 'Collection'),
        totalWIP: n(row, 'Total WIP'),
        itdInvoiced: n(row, 'ITD Invoiced'),
        itdEffort: n(row, 'ITD Effort'),
        remainingBudget: n(row, 'Remaining Budget (Based on Effort)'),
      },
    });
  }
  return { sheet: s.name, asOf, rows };
}

// ------------------------------------------------------------------ monitoring schedule

function parseSchedule(s: SheetRows): SchedulePlan {
  const h = findHeaderRow(s.rows, ['Job Code', 'Monitoring Schedule']);
  const header = s.rows[h];
  const col = columnIndex(header);
  const jobCode = col('Job Code');
  const po = col('Purchase Order No');
  const first = col('Monitoring Schedule'); // January's column; the twelve months follow
  const details = col('Monitoring Schedule Details');
  const notes = col('Monitoring Notes');
  const annual = col('Annual Report Due');
  const plan = col('Management Plan');
  const extra = col('NOTES');
  const consents = col('Consents');
  const folder = col('Folder link');
  const nameCol = Math.max(0, jobCode - 1);
  const rows: ScheduleRow[] = [];
  let order = 0;
  // the month headings sit in the two rows under the header (1..12 and Jan..Dec)
  for (const row of s.rows.slice(h + 3)) {
    const name = text(row[nameCol]);
    const code = text(row[jobCode]);
    if (!name || /^(●|▲|dont mark|if still|done|to do)/i.test(name) || (!code && !name)) continue;
    // the legend at the foot: a name and no months
    const months = Array.from({ length: 12 }, (_, i) => text(row[first + i]));
    if (!code && months.every((m) => !m)) continue;
    rows.push({
      id: uid(),
      name,
      jobCode: code || undefined,
      po: text(row[po]) || undefined,
      months,
      details: text(row[details]) || undefined,
      notes: text(row[notes]) || undefined,
      annualReportDue: text(row[annual]) || undefined,
      managementPlan: text(row[plan]) || undefined,
      extra: text(row[extra]) || undefined,
      consents: text(row[consents]) || undefined,
      folder: text(row[folder]) || undefined,
      order: order++,
    });
  }
  return { sheet: s.name, rows };
}

// ------------------------------------------------------------------ lab invoice tracker

const STATUS_WORDS: Array<[RegExp, LabInvoiceStatus]> = [
  [/paid/i, 'paid'],
  [/query|hold/i, 'query'],
  [/n\/?a|no lab/i, 'na'],
  [/not sent|received/i, 'received'],
  [/sent/i, 'sent'],
  [/await/i, 'awaiting'],
];

export function labStatusFrom(status: string, received: string, sentToAp?: string): LabInvoiceStatus {
  for (const [re, st] of STATUS_WORDS) if (re.test(status)) return st;
  if (sentToAp) return 'sent';
  if (/^y/i.test(received)) return 'received';
  return 'awaiting';
}

function parseLabInvoices(s: SheetRows): LabInvoicePlan {
  const h = findHeaderRow(s.rows, ['Invoice No', 'Invoice Amount (excl GST)']);
  const col = columnIndex(s.rows[h]);
  const g = (row: unknown[], name: string) => {
    const i = col(name);
    return i < 0 ? null : row[i];
  };
  const invoices: LabInvoice[] = [];
  const now = nowIso();
  for (const row of s.rows.slice(h + 1)) {
    const projectName = text(g(row, 'Project'));
    const invoiceNo = text(g(row, 'Invoice No'));
    if (!projectName && !invoiceNo) continue;
    const sentToAp = parseDate(g(row, 'Date Sent to AP'));
    invoices.push({
      id: invoiceNo ? `inv-${invoiceNo}` : uid(),
      roundDate: parseDate(g(row, 'Monitoring Round Date')),
      projectName,
      jobCode: text(g(row, 'Job Code')) || undefined,
      po: text(g(row, 'Purchase Order No')) || undefined,
      roundType: text(g(row, 'Monitoring Type / Round')) || undefined,
      lab: text(g(row, 'Lab')) || undefined,
      labRef: text(g(row, 'Lab Job / Ref No')) || undefined,
      invoiceNo: invoiceNo || undefined,
      invoiceDate: parseDate(g(row, 'Invoice Date')),
      amount: toNumber(g(row, 'Invoice Amount (excl GST)')),
      status: labStatusFrom(text(g(row, 'Status')), text(g(row, 'Invoice Received?')), sentToAp),
      sentToAp,
      notes: text(g(row, 'Notes')) || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
  return { sheet: s.name, invoices };
}

function parseLists(s: SheetRows): ListPlan {
  const h = findHeaderRow(s.rows, ['Project (from Schedule)', 'Job Code']);
  const col = columnIndex(s.rows[h]);
  const rows: ListPlan['rows'] = [];
  for (const row of s.rows.slice(h + 1)) {
    const name = text(row[col('Project (from Schedule)')]);
    if (!name) continue;
    rows.push({ name, jobCode: text(row[col('Job Code')]) || undefined, po: text(row[col('Purchase Order No')]) || undefined });
  }
  return { sheet: s.name, rows };
}

function parseContacts(s: SheetRows): ContactsPlan {
  const h = findHeaderRow(s.rows, ['Project Number', 'Client Contact']);
  const col = columnIndex(s.rows[h]);
  const rows: ContactsPlan['rows'] = [];
  for (const row of s.rows.slice(h + 1)) {
    const projectNumber = text(row[col('Project Number')]);
    const name = text(row[col('Project')]);
    if (!projectNumber && !name) continue;
    rows.push({ name, projectNumber, po: text(row[col('PO # / Client Reference')]) || undefined, client: text(row[col('Client')]) || undefined, contact: text(row[col('Client Contact')]) || undefined, email: text(row[col('Client Email')]) || undefined, folder: text(row[col('Folder Location')]) || undefined });
  }
  return { sheet: s.name, rows };
}

function parseOverrides(s: SheetRows): OverridesPlan {
  const h = findHeaderRow(s.rows, ['Transaction ID · saved', 'Override · Y/N']);
  const col = columnIndex(s.rows[h]);
  const rows: OverridesPlan['rows'] = [];
  for (const row of s.rows.slice(h + 1)) {
    const id = text(row[col('Transaction ID · saved')]);
    const o = text(row[col('Override · Y/N')]);
    if (!id || !o) continue;
    rows.push({ id, billable: /^y/i.test(o) });
  }
  return { sheet: s.name, rows };
}
