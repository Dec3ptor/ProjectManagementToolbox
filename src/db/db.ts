import Dexie, { type Table } from 'dexie';
import type { BillingCycle, ImportBatch, LabInvoice, MetaRecord, Override, Project, ScheduleMark, ScheduleRow, Settings, Todo, Transaction } from './types';

export class PmDatabase extends Dexie {
  projects!: Table<Project, string>;
  transactions!: Table<Transaction, string>;
  overrides!: Table<Override, string>;
  labInvoices!: Table<LabInvoice, string>;
  billing!: Table<BillingCycle, string>;
  scheduleRows!: Table<ScheduleRow, string>;
  scheduleMarks!: Table<ScheduleMark, string>;
  todos!: Table<Todo, string>;
  imports!: Table<ImportBatch, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'PMToolbox') {
    super(name);
    this.version(1).stores({
      projects: 'id, status, mine, updatedAt',
      transactions: 'id, projectId, date, person, taskNumber, invoicingStatus, [projectId+date]',
      overrides: 'id, projectId',
      labInvoices: 'id, projectId, status, invoiceDate',
      billing: 'id, month, projectId',
      scheduleRows: 'id, projectId, order',
      scheduleMarks: 'id, rowId, year',
      todos: 'id, due, projectId',
      imports: 'id, at',
      meta: 'key',
    });
  }
}

export const db = new PmDatabase();

/** Every table a backup carries. */
export const DATA_TABLES = ['projects', 'transactions', 'overrides', 'labInvoices', 'billing', 'scheduleRows', 'scheduleMarks', 'todos', 'imports'] as const;
export type DataTable = (typeof DATA_TABLES)[number];

export const DEFAULT_SETTINGS: Settings = {
  myName: '',
  billingDueDay: 7,
  apOverdueDays: 14,
  budgetWarnPct: 80,
  budgetDangerPct: 95,
  marginWarnPct: 10,
  staleImportDays: 14,
  browserNotifications: false,
  apEmail: 'NZ.AP@wsp.com',
  features: { calendar: false, labInvoices: false },
};

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings');
  const saved = (row?.value as Partial<Settings>) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved, features: { ...DEFAULT_SETTINGS.features, ...(saved.features ?? {}) } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await db.meta.put({ key: 'settings', value: next });
  return next;
}

/** Keep the database when the browser is short of space (where the browser allows asking). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* a convenience only */
  }
}
