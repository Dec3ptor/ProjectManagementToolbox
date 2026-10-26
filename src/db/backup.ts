// A backup is every table as JSON; restoring puts it back (replacing what is here).

import { DATA_TABLES, db, getSettings, saveSettings, type DataTable } from './db';
import type { Settings } from './types';

export const BACKUP_APP = 'PMToolbox';

export interface Backup {
  app: typeof BACKUP_APP;
  version: 1;
  exportedAt: string;
  appVersion: string;
  data: Partial<Record<DataTable, unknown[]>>;
  settings: Settings;
}

export async function exportBackup(appVersion: string): Promise<Backup> {
  const data: Backup['data'] = {};
  await db.transaction('r', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) data[t] = await db.table(t).toArray();
  });
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), appVersion, data, settings: await getSettings() };
}

export function isBackup(v: unknown): v is Backup {
  return !!v && typeof v === 'object' && (v as Backup).app === BACKUP_APP && typeof (v as Backup).data === 'object';
}

export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', DATA_TABLES.map((t) => db.table(t)), async () => {
    for (const t of DATA_TABLES) {
      await db.table(t).clear();
      const rows = b.data[t];
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows);
    }
  });
  if (b.settings) await saveSettings(b.settings);
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', [...DATA_TABLES.map((t) => db.table(t)), db.meta], async () => {
    for (const t of DATA_TABLES) await db.table(t).clear();
    await db.meta.clear();
  });
}
