// Small workbooks shaped like the real exports (made-up numbers and names), built in memory for the tests.

import * as XLSX from '@e965/xlsx';
import { readWorkbook } from '../src/importers/xlsx';

const EFFORT_HEADER = ['Contract Type', 'Contract Number', 'Contract Name', 'Contract Customer', 'Contract Status', 'Contract Currency', 'Contract Biller', 'Project Number', 'Project Name', 'Project Organization', 'Project Status', 'Project Currency', 'Project Manager', 'Project Accountant', 'Project Financial Advisor', 'Project Finance Operations', 'Task Number', 'Task Name', 'Billable Task', 'Transaction Number', 'Expenditure Category', 'Expenditure Type', 'Expenditure Date', 'Expenditure Week Ending Date', 'Expenditure Reporting Period', 'Expenditure Organization', 'Person Type', 'Person Number', 'Person Name', 'HCM Grade', 'HCM Job', 'Job / Billing Title', 'Non Labor Resource', 'PO Number', 'Supplier', 'Supplier Invoice Number', 'Last Invoicing', 'Transaction Invoicing Status', 'Invoice Currency', 'Project Invoice Status', 'Project Invoice Number', 'AR Invoice Number', 'Invoicing Error Message', 'Invoicing on Hold', 'Contract Line', 'Bill Plan Method', 'Bill Plan Name', 'Revenue Plan Method', 'Revenue Plan Name', 'Schedule Name', 'Non-Billable Cost (Ledger Currency)', 'Effort Logic', 'Quantity', 'Unit of Measure', 'Burdened Cost Rate (Project Ledger Currency)', 'Burdened Cost (Project Ledger Currency)', 'Rate (Discount) / Mark-up', 'Standard (Discount) / Mark-up', 'Labor Multiplier', 'Bill Rate (Invoice Currency)', 'Effort (Invoice Currency)', 'Expenditure Comment', 'Net Zero Transaction', 'Original Transaction Number'];

function effortRow(o: { project: string; name: string; task: string; taskName: string; txn: number; date: Date; person?: string; supplier?: string; category?: string; type?: string; status?: string; logic: string; qty: number; uom?: string; cost: number; rate?: number; effort: number; comment?: string; manager?: string }): unknown[] {
  const r: unknown[] = Array(EFFORT_HEADER.length).fill(null);
  const set = (h: string, v: unknown) => (r[EFFORT_HEADER.indexOf(h)] = v);
  set('Contract Number', 'C-1');
  set('Contract Customer', 'Test Council');
  set('Project Number', o.project);
  set('Project Name', o.name);
  set('Project Status', 'Active');
  set('Project Manager', o.manager ?? 'Smith, Jane');
  set('Task Number', o.task);
  set('Task Name', o.taskName);
  set('Billable Task', 'Yes');
  set('Transaction Number', o.txn);
  set('Expenditure Category', o.category ?? 'Labor');
  set('Expenditure Type', o.type ?? 'Regular Hours');
  set('Expenditure Date', o.date);
  set('Expenditure Week Ending Date', o.date);
  set('Expenditure Reporting Period', '202610');
  set('Person Type', o.person ? 'EMP' : null);
  set('Person Name', o.person ?? null);
  set('Supplier', o.supplier ?? null);
  set('Transaction Invoicing Status', o.status ?? 'Uninvoiced');
  set('Invoicing on Hold', 'No');
  set('Bill Plan Method', 'Bill Rate Invoice');
  set('Effort Logic', o.logic);
  set('Quantity', o.qty);
  set('Unit of Measure', o.uom ?? 'HOURS');
  set('Burdened Cost (Project Ledger Currency)', o.cost);
  set('Bill Rate (Invoice Currency)', o.rate ?? 0);
  set('Effort (Invoice Currency)', o.effort);
  set('Expenditure Comment', o.comment ?? null);
  set('Net Zero Transaction', 'No');
  set('Original Transaction Number', o.txn);
  return r;
}

export const P1 = 'NZL-WSP-2-11111.00';
export const P2 = 'NZ0022222.3333';

export function effortRows(): unknown[][] {
  const d = (s: string) => new Date(s + 'T00:00:00');
  return [
    EFFORT_HEADER,
    effortRow({ project: P1, name: 'Test Environmental Monitoring', task: 'A2627', taskName: 'Burma LF 26/27', txn: 1001, date: d('2026-09-10'), person: 'Smith, Jane (Jane)', logic: 'Labor: Quantity * Bill_Rate', qty: 2, cost: 200, rate: 175, effort: 350, comment: 'Sampling' }),
    effortRow({ project: P1, name: 'Test Environmental Monitoring', task: '00001', taskName: 'Overheads', txn: 1002, date: d('2026-09-12'), person: 'Smith, Jane (Jane)', logic: 'Non Billable Non Converted (Labor / Non Labor) = NULL', qty: 1, cost: 100, effort: 0, comment: 'Admin' }),
    effortRow({ project: P1, name: 'Test Environmental Monitoring', task: 'A2627', taskName: 'Burma LF 26/27', txn: 1003, date: d('2026-08-20'), person: 'Jones, Sam (Sam)', logic: 'Labor: Quantity * Bill_Rate', qty: 4, cost: 400, rate: 150, effort: 600, status: 'Fully invoiced', comment: 'Report' }),
    effortRow({ project: P1, name: 'Test Environmental Monitoring', task: 'A2627', taskName: 'Burma LF 26/27', txn: 1004, date: d('2026-09-15'), supplier: 'R J HILL LABORATORIES LIMITED', category: 'Expenses', type: 'Laboratory Costs', logic: 'Non Labor: Burdended Cost + Markup (B)', qty: 500, uom: 'CURRENCY', cost: 500, effort: 550, comment: 'Leachate' }),
    effortRow({ project: P1, name: 'Test Environmental Monitoring', task: 'A2627', taskName: 'Burma LF 26/27', txn: 1005, date: d('2026-07-02'), person: 'Jones, Sam (Sam)', logic: 'Labor: Quantity * Bill_Rate', qty: 1, cost: 100, rate: 150, effort: 150, comment: 'Old, still unbilled' }),
    effortRow({ project: P2, name: 'NZ-Other Landfill Monitoring', task: '0001', taskName: 'Monitoring', txn: 2001, date: d('2026-09-03'), person: 'Smith, Jane (Jane)', logic: 'Labor: DLM Without Bill Rate Based and Revenue Rate Base = Raw_Cost * DLM', qty: 3, cost: 300, effort: 375, manager: 'Brown, Alex' }),
  ];
}

export function powerBiRows(): unknown[][] {
  return [
    ['Project #', 'Project Name', 'Project Manager', 'Project Financial Advisor', 'Fee Type', 'Current Budget Revenue', 'ITD Revenue ', 'Revenue % Complete', 'Current Budget Cost', 'Actual Cost', '% Spent (Cost)', 'Current Budget NM %', 'Actual NM %', 'Current Budget DLM', 'Actual DLM', 'Total AR', 'Collection', 'Total WIP', 'ITD Invoiced', 'ITD Effort', 'Remaining Budget (Based on Effort)'],
    [P1, 'Test Environmental Monitoring', 'Smith Jane Mary', null, 'FF + T&M', 100000, 60000, 0.6, 70000, 68000, 0.971, 0.3, 0.2, 3, 2.9, 5000, 1000, 8000, 50000, 65000, 35000],
    [P2, 'NZ-Other Landfill Monitoring', 'Brown Alex', null, 'Fixed Fee', 8000, 7000, 0.875, 6000, 4000, 0.67, 0.2, 0.3, 1.2, 1.3, null, 2000, 1000, 6000, 7000, 1000],
    ['Applied filters:\nProject # top 2,500', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ];
}

export function scheduleRows(): unknown[][] {
  const months = (m: Record<number, string>) => Array.from({ length: 12 }, (_, i) => m[i + 1] ?? null);
  return [
    [null, 'Job Code', 'Purchase Order No', 'Monitoring Schedule', null, null, null, null, null, null, null, null, null, null, null, 'Monitoring Schedule Details', 'Monitoring Notes', 'Annual Report Due', 'Management Plan', 'NOTES', 'Consents', 'Folder link'],
    [null, null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, null, null, null, null, null, null, null],
    [null, null, null, 'Jan', 'Feb', 'Mar', 'April', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', null, null, null, null, null, null, null],
    ['Burma Rd Closed Landfill', '2-11111.00  A2627', null, ...months({ 1: '▲#', 3: '●', 6: '●', 9: '●', 12: '●' }), '▲= Gas', null, 'January', null, null, 'RC 1', null],
    ['Other Landfill', 'NZ0022222.3333', 'P100001NZ001', ...months({ 2: '(_______________)', 8: '(_______________)#' }), 'Annual report due in October', 'Send results to the council', 'October', null, null, null, 'G:\\somewhere'],
    ['DONT MARK GREEN UNTIL RESULTS SENT OR REPORT DONE', 'DONE', ...months({})],
    ['●', 'TO DO', ...months({})],
  ];
}

export function labRows(): unknown[][] {
  return [
    ['Lab Invoice → AP Tracker'],
    ['Log every monitoring round here.'],
    ['Monitoring Round Date', 'Project', 'Job Code', 'Purchase Order No', 'Monitoring Type / Round', 'Lab', 'Lab Job / Ref No', 'Invoice No', 'Invoice Date', 'Invoice Amount (excl GST)', 'Invoice Received?', 'Date Sent to AP', 'Status', 'Days Since Invoice', 'Notes', 'AP Email (copy when sending)', 'Summary'],
    [new Date('2026-09-02T00:00:00'), 'Burma Rd Closed Landfill', '2-11111.00  A2627', 'P100965NZ001', 'September full round', 'Hill Labs', 4304935, 4304935, new Date('2026-09-28T00:00:00'), 2490.16, 'Yes', '29/09/2026', 'Sent to AP', null, 'PO on invoice', 'To: AP', null],
    [new Date('2026-09-10T00:00:00'), 'Other Landfill', 'NZ0022222.3333', 'P100001NZ001', 'Leachate - 4 samples', 'Hill Labs', 4303765, 4303765, new Date('2026-09-10T00:00:00'), 564.92, 'Yes', null, 'Received - not sent', null, null, null, null],
    [new Date('2026-10-01T00:00:00'), 'Other Landfill', 'NZ0022222.3333', 'P100001NZ001', 'Groundwater', 'Hill Labs', null, null, null, null, 'No', null, 'Awaiting lab invoice', null, null, null, null],
  ];
}

export function listsRows(): unknown[][] {
  return [
    ['Project (from Schedule)', 'Job Code', 'Purchase Order No', null, 'Status', null, 'Yes/No'],
    ['Burma Rd Closed Landfill', '2-11111.00  A2627', 'P100965NZ001', null, 'Awaiting lab invoice', null, 'Yes'],
    ['Other Landfill', 'NZ0022222.3333', 'P100001NZ001', null, null, null, null],
  ];
}

export function contactRows(): unknown[][] {
  return [
    ['Project', 'Project Number', 'PO # / Client Reference', 'Client', 'Client Contact', 'Client Email', 'Folder Location'],
    ['Other Landfill', P2, 'CM688', 'ODC', 'A Person', 'a.person@example.govt.nz', null],
  ];
}

export function overrideRows(): unknown[][] {
  return [
    ['BILLABILITY OVERRIDES  |  Saved by transaction ID'],
    ['Transaction ID · saved', 'Override · Y/N', 'Source · Effort Logic', 'Effective status', 'Project #', 'Person / resource', 'Labor hours', 'Source date', 'Review status', 'Comment · Effort', null, 'New IDs · Effort', 'Source · Effort Logic', 'Count'],
    [1001, 'N', 'Yes', 'No', P1, 'Smith, Jane (Jane)', 2, new Date('2026-09-10T00:00:00'), 'Overridden', 'Sampling', null, null, null, null],
    [1003, null, 'Yes', 'Yes', P1, 'Jones, Sam (Sam)', 4, new Date('2026-08-20T00:00:00'), 'Follows Effort', 'Report', null, null, null, null],
  ];
}

/** A workbook with these sheets, read back the way the app reads a dropped file. */
export function workbook(sheets: Record<string, unknown[][]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer;
  return readWorkbook(buf);
}
