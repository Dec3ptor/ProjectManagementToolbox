import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Group, Modal, Paper, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useNavigate, useParams } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { db } from '../db/db';
import type { MarkStatus, ScheduleRow } from '../db/types';
import { PageHeader, EmptyState } from '../components/common';
import { useEverything } from '../hooks/useData';
import { MONTHS_SHORT, nowIso, todayStr } from '../lib/dates';
import { shortName, uid } from '../lib/format';
import { MARK_META, cellSymbols, hasWork, markId, scheduledItems } from '../lib/schedule';
import { matchProject } from '../lib/matching';

export function CalendarPage() {
  const { year: param } = useParams();
  const navigate = useNavigate();
  const today = todayStr();
  const year = Number(param) || Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) : 0;
  const { rows, marks, projects } = useEverything();
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const markById = useMemo(() => new Map(marks.map((m) => [m.id, m])), [marks]);
  const items = useMemo(() => scheduledItems(rows, marks, year), [rows, marks, year]);
  const counts = useMemo(() => {
    const c: Record<MarkStatus, number> = { todo: 0, doing: 0, done: 0, cancelled: 0 };
    for (const i of items) c[i.status]++;
    return c;
  }, [items]);

  const cycle = async (row: ScheduleRow, month: number) => {
    const id = markId(row.id, year, month);
    const cur = markById.get(id);
    const next = MARK_META[cur?.status ?? 'todo'].next;
    if (next === 'todo') await db.scheduleMarks.delete(id);
    else await db.scheduleMarks.put({ id, rowId: row.id, year, month, status: next, at: nowIso() });
  };

  const newRow = (): ScheduleRow => ({ id: uid(), name: '', months: Array(12).fill(''), order: (rows[rows.length - 1]?.order ?? 0) + 1 });

  return (
    <Stack gap="md">
      <PageHeader
        title="Monitoring calendar"
        description="The monitoring schedule, month by month. Click a cell to move it along: to do → results to analyse → done → cancelled. Marks are kept per year."
        actions={
          <Group gap="xs">
            <ActionIcon variant="default" size="lg" onClick={() => navigate(`/calendar/${year - 1}`)} aria-label="Previous year">
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Text fw={600} w={48} ta="center">
              {year}
            </Text>
            <ActionIcon variant="default" size="lg" onClick={() => navigate(`/calendar/${year + 1}`)} aria-label="Next year">
              <IconChevronRight size={16} />
            </ActionIcon>
            <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => setEditing(newRow())}>
              Add a row
            </Button>
          </Group>
        }
      />
      <Group gap="xs">
        {(Object.keys(MARK_META) as MarkStatus[]).map((k) => (
          <Badge key={k} color={MARK_META[k].color} variant="light" size="lg" radius="sm">
            {MARK_META[k].label}: {counts[k]}
          </Badge>
        ))}
      </Group>
      {!rows.length ? (
        <EmptyState title="No schedule yet">Import the monitoring spreadsheet – its “Schedule All Monitoring” sheet becomes this calendar – or add rows by hand.</EmptyState>
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <ScrollArea type="auto">
            <table className="pm-grid pm-cal">
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 3 }}>Project / site</th>
                  <th>Job code</th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={m} className={i + 1 === thisMonth ? 'thismonth' : undefined} style={{ textAlign: 'center' }}>
                      {m}
                    </th>
                  ))}
                  <th>Details</th>
                  <th>Annual report</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const project = r.projectId ? projects.find((p) => p.id === r.projectId) : undefined;
                  return (
                    <tr key={r.id}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1 }}>
                        <Text size="sm" fw={600} span>
                          {r.name}
                        </Text>
                        {project && (
                          <Text size="xs" c="dimmed">
                            {project.id}
                          </Text>
                        )}
                      </td>
                      <td>
                        <Text size="xs" span>
                          {r.jobCode}
                        </Text>
                        {r.po && (
                          <Text size="xs" c="dimmed">
                            {r.po}
                          </Text>
                        )}
                      </td>
                      {r.months.map((cell, i) => {
                        const work = hasWork(cell);
                        const mark = markById.get(markId(r.id, year, i + 1));
                        const status: MarkStatus | undefined = work ? mark?.status ?? 'todo' : undefined;
                        const cls = ['cell', status, i + 1 === thisMonth ? 'thismonth' : ''].filter(Boolean).join(' ');
                        return (
                          <Tooltip key={i} label={work ? `${cell.trim()} – ${MARK_META[status!].label}. Click to change.` : 'Nothing scheduled. Edit the row to add something.'} disabled={!work}>
                            <td className={cls} onClick={() => work && cycle(r, i + 1)}>
                              {work ? cellSymbols(cell).join(' ').slice(0, 14) || '●' : ''}
                            </td>
                          </Tooltip>
                        );
                      })}
                      <td className="wrap" style={{ maxWidth: 320 }}>
                        <Tooltip label={[r.details, r.notes].filter(Boolean).join('\n\n')} disabled={!r.details && !r.notes} maw={420}>
                          <Text size="xs" lineClamp={2} style={{ whiteSpace: 'normal' }}>
                            {r.details}
                            {r.notes ? ` — ${r.notes}` : ''}
                          </Text>
                        </Tooltip>
                      </td>
                      <td className="wrap" style={{ maxWidth: 200 }}>
                        <Text size="xs" lineClamp={2} style={{ whiteSpace: 'normal' }}>
                          {r.annualReportDue}
                        </Text>
                      </td>
                      <td>
                        <ActionIcon variant="subtle" size="sm" onClick={() => setEditing(r)} aria-label="Edit">
                          <IconPencil size={14} />
                        </ActionIcon>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </Paper>
      )}
      <Text size="xs" c="dimmed">
        The symbols are the spreadsheet’s: ● groundwater / sampling round, ▲ all bores or gas, # extra or report, R reporting, (____) a rain-dependent window. Each row’s details say what they mean for that site.
      </Text>
      {editing && <EditRow row={editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}

function EditRow({ row, onClose }: { row: ScheduleRow; onClose: () => void }) {
  const { projects } = useEverything();
  const [v, setV] = useState<ScheduleRow>(row);
  const set = (patch: Partial<ScheduleRow>) => setV((x) => ({ ...x, ...patch }));
  const save = async () => {
    if (!v.name.trim()) return;
    const projectId = v.projectId ?? matchProject(v.jobCode, projects)?.id;
    await db.scheduleRows.put({ ...v, projectId });
    onClose();
  };
  const remove = () =>
    modals.openConfirmModal({
      title: 'Remove this row?',
      children: <Text size="sm">Its marks go too.</Text>,
      labels: { confirm: 'Remove', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await db.scheduleMarks.where('rowId').equals(v.id).delete();
        await db.scheduleRows.delete(v.id);
        onClose();
      },
    });
  return (
    <Modal opened onClose={onClose} title={row.name || 'New schedule row'} size="lg">
      <Stack gap="xs">
        <SimpleGrid cols={2} spacing="xs">
          <TextInput label="Project / site" value={v.name} onChange={(e) => set({ name: e.currentTarget.value })} required />
          <TextInput label="Job code" value={v.jobCode ?? ''} onChange={(e) => set({ jobCode: e.currentTarget.value || undefined })} placeholder="e.g. 2-34646.00  E2627" />
          <TextInput label="Purchase order" value={v.po ?? ''} onChange={(e) => set({ po: e.currentTarget.value || undefined })} />
          <Select label="Project" data={projects.map((p) => ({ value: p.id, label: `${shortName(p.name)} (${p.id})` }))} value={v.projectId ?? null} onChange={(id) => set({ projectId: id ?? undefined })} searchable clearable placeholder="Matched from the job code when blank" />
        </SimpleGrid>
        <Text size="sm" fw={600}>
          Months (type the marks – ● ▲ # R – or any text; blank for nothing)
        </Text>
        <SimpleGrid cols={{ base: 4, sm: 6 }} spacing={6}>
          {MONTHS_SHORT.map((m, i) => (
            <TextInput key={m} label={m} size="xs" value={v.months[i] ?? ''} onChange={(e) => set({ months: v.months.map((x, j) => (j === i ? e.currentTarget.value : x)) })} />
          ))}
        </SimpleGrid>
        <Textarea label="What the marks mean / schedule details" autosize minRows={2} value={v.details ?? ''} onChange={(e) => set({ details: e.currentTarget.value || undefined })} />
        <Textarea label="Monitoring notes (who gets results, what to take)" autosize minRows={2} value={v.notes ?? ''} onChange={(e) => set({ notes: e.currentTarget.value || undefined })} />
        <SimpleGrid cols={2} spacing="xs">
          <TextInput label="Annual report due" value={v.annualReportDue ?? ''} onChange={(e) => set({ annualReportDue: e.currentTarget.value || undefined })} placeholder="e.g. October" />
          <TextInput label="Management plan" value={v.managementPlan ?? ''} onChange={(e) => set({ managementPlan: e.currentTarget.value || undefined })} />
          <TextInput label="Consents" value={v.consents ?? ''} onChange={(e) => set({ consents: e.currentTarget.value || undefined })} />
          <TextInput label="Folder" value={v.folder ?? ''} onChange={(e) => set({ folder: e.currentTarget.value || undefined })} />
        </SimpleGrid>
        <Group justify="space-between">
          <Button color="red" variant="subtle" leftSection={<IconTrash size={14} />} onClick={remove}>
            Remove
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!v.name.trim()}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
