// Live views of the database: a component using one re-renders as the data changes.

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '../db/db';
import type { BillingCycle, ImportBatch, LabInvoice, Override, Project, ScheduleMark, ScheduleRow, Settings, Todo, Transaction } from '../db/types';
import { overrideMap, type OverrideMap } from '../lib/billability';
import { buildAlerts, type Alert } from '../lib/alerts';
import { todayStr } from '../lib/dates';

const EMPTY: never[] = [];

export const useSettings = (): Settings => useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...(((await db.meta.get('settings'))?.value as Partial<Settings>) ?? {}) }), [], DEFAULT_SETTINGS);
export const useProjects = (): Project[] | undefined => useLiveQuery(() => db.projects.toArray(), []);
export const useProject = (id: string | undefined): Project | undefined | null => useLiveQuery(async () => (id ? (await db.projects.get(id)) ?? null : null), [id]);
export const useTransactions = (projectId?: string): Transaction[] => useLiveQuery(() => (projectId ? db.transactions.where('projectId').equals(projectId).toArray() : db.transactions.toArray()), [projectId], EMPTY as Transaction[]);
export const useOverrides = (projectId?: string): OverrideMap => {
  const list = useLiveQuery(() => (projectId ? db.overrides.where('projectId').equals(projectId).toArray() : db.overrides.toArray()), [projectId], EMPTY as Override[]);
  return useMemo(() => overrideMap(list), [list]);
};
export const useCycles = (): BillingCycle[] => useLiveQuery(() => db.billing.toArray(), [], EMPTY as BillingCycle[]);
export const useLabInvoices = (): LabInvoice[] => useLiveQuery(() => db.labInvoices.toArray(), [], EMPTY as LabInvoice[]);
export const useScheduleRows = (): ScheduleRow[] => useLiveQuery(() => db.scheduleRows.orderBy('order').toArray(), [], EMPTY as ScheduleRow[]);
export const useScheduleMarks = (): ScheduleMark[] => useLiveQuery(() => db.scheduleMarks.toArray(), [], EMPTY as ScheduleMark[]);
export const useTodos = (): Todo[] => useLiveQuery(() => db.todos.toArray(), [], EMPTY as Todo[]);
export const useImports = (): ImportBatch[] => useLiveQuery(() => db.imports.orderBy('at').reverse().toArray(), [], EMPTY as ImportBatch[]);

/** Everything the dashboard and the alerts need. */
export function useEverything() {
  const settings = useSettings();
  const projects = useProjects();
  const txns = useTransactions();
  const overrides = useOverrides();
  const cycles = useCycles();
  const labInvoices = useLabInvoices();
  const rows = useScheduleRows();
  const marks = useScheduleMarks();
  const todos = useTodos();
  const imports = useImports();
  const today = todayStr();
  const alerts: Alert[] = useMemo(() => (projects ? buildAlerts({ projects, txns, overrides, cycles, labInvoices, rows, marks, todos, imports, settings, today }) : []), [projects, txns, overrides, cycles, labInvoices, rows, marks, todos, imports, settings, today]);
  return { settings, projects: projects ?? [], loading: projects === undefined, txns, overrides, cycles, labInvoices, rows, marks, todos, imports, alerts, today };
}

export const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;
