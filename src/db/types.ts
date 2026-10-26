// The records PM Toolbox keeps (in the browser's IndexedDB) and the shapes shared across the app.

export type ProjectStatus = 'active' | 'on-hold' | 'closed';

/** How a project is billed: people's time and costs line by line, or a % of each task's quoted fee. */
export type BillingMode = 'time' | 'task';

/** A task's quoted fee, for projects billed per task. */
export interface TaskFee {
  taskNumber: string;
  taskName: string;
  fee: number;
}

/** The project's money, as the Power BI export reports it (inception to date). */
export interface ProjectFinancials {
  /** The date of the export it came from (YYYY-MM-DD). */
  asOf: string;
  feeType?: string;
  budgetRevenue?: number;
  itdRevenue?: number;
  revenuePct?: number;
  budgetCost?: number;
  actualCost?: number;
  costPct?: number;
  budgetNM?: number;
  actualNM?: number;
  budgetDLM?: number;
  actualDLM?: number;
  totalAR?: number;
  collection?: number;
  totalWIP?: number;
  itdInvoiced?: number;
  itdEffort?: number;
  remainingBudget?: number;
}

export interface Project {
  /** The project number, e.g. NZL-WSP-2-34646.00 */
  id: string;
  name: string;
  customer?: string;
  manager?: string;
  financialAdvisor?: string;
  status: ProjectStatus;
  /** I am the project manager: it is billed and watched here. */
  mine: boolean;
  billPlanMethod?: string;
  contractNumber?: string;
  /** Unset: per task when the bill plan is percent-complete or amount-based, else time. */
  billingMode?: BillingMode;
  taskFees?: TaskFee[];
  fin?: ProjectFinancials;
  /** Details kept by hand (or from the monitoring workbook). */
  jobCode?: string;
  po?: string;
  /** The client's own PO or reference for the work (goes on our invoices). */
  clientReference?: string;
  clientContact?: string;
  clientEmail?: string;
  folder?: string;
  consents?: string;
  notes?: string;
  /** Other codes the project is known by (job codes, short numbers). */
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export type InvoicingStatus = 'Uninvoiced' | 'Fully invoiced' | 'Partially invoiced' | string;

/** One line of the Effort Report: an hour, a kilometre, a lab invoice… */
export interface Transaction {
  /** The transaction number. */
  id: string;
  projectId: string;
  taskNumber: string;
  taskName: string;
  billableTask: boolean;
  category: string; // Labor, Expenses, Equipment, Travel
  type: string; // Regular Hours, Laboratory Costs, Equipment Usage - KM…
  date: string; // YYYY-MM-DD
  weekEnding?: string;
  period?: string; // 202610
  person?: string;
  personNumber?: string;
  grade?: string;
  jobTitle?: string;
  supplier?: string;
  supplierInvoice?: string;
  poNumber?: string;
  invoicingStatus: InvoicingStatus;
  projectInvoiceStatus?: string;
  projectInvoiceNumber?: string;
  arInvoiceNumber?: string;
  lastInvoicing?: string;
  billPlanMethod?: string;
  effortLogic?: string;
  quantity: number;
  uom: string; // HOURS, CURRENCY, KM
  costRate?: number;
  cost: number;
  billRate?: number;
  /** The bill amount (Effort, invoice currency). */
  effort: number;
  comment?: string;
  /** Billable according to the export's Effort Logic. */
  sourceBillable: boolean;
  importId: string;
}

/** My decision on a transaction's billability, kept by transaction number across imports. */
export interface Override {
  id: string; // the transaction number
  projectId: string;
  billable: boolean;
  note?: string;
  at: string;
}

export type LabInvoiceStatus = 'awaiting' | 'received' | 'sent' | 'query' | 'paid' | 'na';

export interface LabInvoice {
  id: string;
  roundDate?: string;
  projectId?: string;
  projectName: string;
  jobCode?: string;
  po?: string;
  roundType?: string;
  lab?: string;
  labRef?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  amount?: number;
  status: LabInvoiceStatus;
  sentToAp?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type BillingStep = 'reviewed' | 'overrides' | 'sent' | 'invoiced';

/** One project's billing for one month: the steps done and when. */
export interface BillingCycle {
  id: string; // `${month}|${projectId}`
  month: string; // YYYY-MM
  projectId: string;
  steps: Partial<Record<BillingStep, string>>;
  /** Nothing to bill this month. */
  skipped?: boolean;
  /** Projects billed per task: the cumulative % complete claimed for each task number, as at this month. */
  taskProgress?: Record<string, number>;
  invoiceAmount?: number;
  invoiceNumber?: string;
  notes?: string;
  updatedAt: string;
}

/** A row of the monitoring schedule: what is sampled in which months. */
export interface ScheduleRow {
  id: string;
  name: string;
  jobCode?: string;
  po?: string;
  projectId?: string;
  /** Twelve cells, January first: the marks as written in the spreadsheet ('' for none). */
  months: string[];
  details?: string;
  notes?: string;
  annualReportDue?: string;
  managementPlan?: string;
  extra?: string;
  consents?: string;
  folder?: string;
  order: number;
}

export type MarkStatus = 'todo' | 'doing' | 'done' | 'cancelled';

/** The state of one schedule cell in one year. */
export interface ScheduleMark {
  id: string; // `${rowId}|${year}-${MM}`
  rowId: string;
  year: number;
  month: number; // 1–12
  status: MarkStatus;
  note?: string;
  at: string;
}

export interface Todo {
  id: string;
  title: string;
  due?: string;
  projectId?: string;
  done?: string;
  notes?: string;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  at: string;
  kinds: string[];
  counts: Record<string, number>;
}

export interface Settings {
  /** My name as the exports write it (e.g. "Foote, Benjamin"): projects with this manager are mine. */
  myName: string;
  /** Billing for a month is due by this day of the next month. */
  billingDueDay: number;
  /** A lab invoice received but not sent to AP after this many days is overdue. */
  apOverdueDays: number;
  /** Cost spent, as % of budget, that turns a project amber / red. */
  budgetWarnPct: number;
  budgetDangerPct: number;
  /** Net margin % below which a project is flagged. */
  marginWarnPct: number;
  /** Ask for a fresh Effort Report after this many days. */
  staleImportDays: number;
  /** Also show the day's alerts as browser notifications while the app is open. */
  browserNotifications: boolean;
  /** The e-mail that lab invoices are sent to for payment. */
  apEmail: string;
  /** Parts of the app that can be switched off. */
  features: { calendar: boolean; labInvoices: boolean };
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
