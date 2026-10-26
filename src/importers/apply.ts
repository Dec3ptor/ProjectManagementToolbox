// Writing an import plan into the database: transactions by number, projects by number (kept if known), the rest matched up.

import { db, type PmDatabase } from '../db/db';
import type { ImportBatch, Override, Project, ScheduleMark, Settings } from '../db/types';
import { nowIso } from '../lib/dates';
import { uid } from '../lib/format';
import { firstCode, matchProject, normaliseCode } from '../lib/matching';
import { planKinds, type ImportPlan } from './analyse';

export interface ApplyResult {
  batch: ImportBatch;
  counts: Record<string, number>;
}

/** Am I the manager named? Matches "Foote, Benjamin" with "Foote Benjamin Colin" and the other way round. */
export function isMe(manager: string | undefined, myName: string): boolean {
  if (!manager || !myName.trim()) return false;
  const words = (s: string) => s.toLowerCase().replace(/[(),.]/g, ' ').split(/\s+/).filter(Boolean);
  const mine = words(myName);
  const theirs = words(manager);
  return mine.length > 0 && mine.filter((w) => theirs.includes(w)).length >= Math.min(2, mine.length);
}

export async function applyPlan(plan: ImportPlan, settings: Settings, database: PmDatabase = db): Promise<ApplyResult> {
  const now = nowIso();
  const counts: Record<string, number> = {};
  const importId = plan.effort?.transactions[0]?.importId ?? uid();
  await database.transaction('rw', [database.projects, database.transactions, database.overrides, database.labInvoices, database.scheduleRows, database.scheduleMarks, database.imports], async () => {
    const projects = new Map((await database.projects.toArray()).map((p) => [p.id, p]));
    const upsertProject = (id: string, patch: Partial<Project>) => {
      const cur = projects.get(id);
      const next: Project = cur
        ? { ...cur, ...stripUndefined(patch), updatedAt: now }
        : { id, name: patch.name ?? id, status: 'active', mine: false, aliases: [], createdAt: now, updatedAt: now, ...stripUndefined(patch) };
      if (!cur) {
        // the project's short code is an alias: "NZL-WSP-2-34646.00" is also "2-34646.00"
        const short = normaliseCode(id);
        if (short !== id.toLowerCase() && !next.aliases.includes(short)) next.aliases = [...next.aliases, short];
      }
      projects.set(id, next);
      return next;
    };

    if (plan.effort) {
      for (const p of plan.effort.projects) {
        const cur = projects.get(p.id);
        upsertProject(p.id, {
          name: p.name,
          customer: p.customer,
          manager: p.manager,
          financialAdvisor: p.financialAdvisor,
          billPlanMethod: p.billPlanMethod,
          contractNumber: p.contractNumber,
          status: cur?.status ?? (/^active/i.test(p.status) ? 'active' : 'closed'),
          // mine when the report names me as manager (a choice made by hand stays)
          mine: cur ? cur.mine || isMe(p.manager, settings.myName) : isMe(p.manager, settings.myName),
        });
      }
      await database.transactions.bulkPut(plan.effort.transactions);
      counts.transactions = plan.effort.transactions.length;
    }

    if (plan.powerBi) {
      for (const r of plan.powerBi.rows) {
        const cur = projects.get(r.id);
        upsertProject(r.id, { name: cur?.name ?? r.name, manager: r.manager ?? cur?.manager, financialAdvisor: r.financialAdvisor ?? cur?.financialAdvisor, fin: r.fin, mine: cur ? cur.mine || isMe(r.manager, settings.myName) : isMe(r.manager, settings.myName) });
      }
      counts.financials = plan.powerBi.rows.length;
    }

    if (plan.contacts) {
      for (const c of plan.contacts.rows) {
        const hit = matchProject(c.projectNumber, [...projects.values()]);
        if (!hit) continue;
        upsertProject(hit.id, { clientContact: c.contact ?? hit.clientContact, clientEmail: c.email ?? hit.clientEmail, folder: c.folder ?? hit.folder, clientReference: c.po ?? hit.clientReference, customer: hit.customer ?? c.client });
        counts.contacts = (counts.contacts ?? 0) + 1;
      }
    }

    if (plan.schedule) {
      // rows replace the schedule as it stands, keeping the marks of rows with the same name and code
      const old = await database.scheduleRows.toArray();
      const oldByKey = new Map(old.map((r) => [`${r.name.toLowerCase()}|${r.jobCode ?? ''}`, r]));
      const marks = await database.scheduleMarks.toArray();
      const all = [...projects.values()];
      const lists = new Map((plan.lists?.rows ?? []).map((l) => [l.name.trim().toLowerCase(), l]));
      const keepMarks: ScheduleMark[] = [];
      const rows = plan.schedule.rows.map((r) => {
        const prev = oldByKey.get(`${r.name.toLowerCase()}|${r.jobCode ?? ''}`);
        const list = lists.get(r.name.trim().toLowerCase());
        const row = { ...r, id: prev?.id ?? r.id, po: r.po ?? list?.po, projectId: matchProject(r.jobCode ?? list?.jobCode, all)?.id };
        if (prev) keepMarks.push(...marks.filter((m) => m.rowId === prev.id));
        return row;
      });
      await database.scheduleRows.clear();
      await database.scheduleMarks.clear();
      await database.scheduleRows.bulkPut(rows);
      await database.scheduleMarks.bulkPut(keepMarks);
      counts.schedule = rows.length;
      // the schedule's job codes are the projects' aliases (so the same codes match in the lab tracker)
      for (const r of rows) if (r.projectId && r.jobCode) {
        const p = projects.get(r.projectId)!;
        const code = firstCode(r.jobCode);
        if (code && !p.aliases.some((a) => firstCode(a) === code)) upsertProject(p.id, { aliases: [...p.aliases, code] });
        if (!p.po && r.po) upsertProject(p.id, { po: r.po });
      }
    } else if (plan.lists) {
      const all = [...projects.values()];
      for (const l of plan.lists.rows) {
        const hit = matchProject(l.jobCode, all);
        if (hit && l.po && !hit.po) upsertProject(hit.id, { po: l.po });
      }
    }

    if (plan.labInvoices) {
      const all = [...projects.values()];
      const rows = await database.scheduleRows.toArray();
      const existing = new Map((await database.labInvoices.toArray()).map((i) => [i.id, i]));
      let n = 0;
      for (const inv of plan.labInvoices.invoices) {
        const byRow = rows.find((r) => r.name.trim().toLowerCase() === inv.projectName.trim().toLowerCase());
        const projectId = matchProject(inv.jobCode, all)?.id ?? byRow?.projectId;
        const cur = existing.get(inv.id);
        // a tracker row already here keeps the status set in the app (the sheet may be older)
        await database.labInvoices.put(cur ? { ...inv, status: cur.status, sentToAp: cur.sentToAp ?? inv.sentToAp, notes: cur.notes ?? inv.notes, createdAt: cur.createdAt, projectId: projectId ?? cur.projectId } : { ...inv, projectId });
        n++;
      }
      counts.labInvoices = n;
    }

    if (plan.overrides) {
      const txns = new Map((await database.transactions.toArray()).map((t) => [t.id, t]));
      const existing = new Set((await database.overrides.toCollection().primaryKeys()) as string[]);
      const add: Override[] = [];
      for (const o of plan.overrides.rows) {
        if (existing.has(o.id)) continue;
        const t = txns.get(o.id);
        add.push({ id: o.id, projectId: t?.projectId ?? '', billable: o.billable, note: 'From the workbook’s Billability Overrides', at: now });
      }
      await database.overrides.bulkPut(add);
      counts.overrides = add.length;
    }

    await database.projects.bulkPut([...projects.values()]);
    counts.projects = projects.size;
  });
  const batch: ImportBatch = { id: importId, fileName: plan.fileName, at: now, kinds: planKinds(plan), counts };
  await database.imports.put(batch);
  return { batch, counts };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
