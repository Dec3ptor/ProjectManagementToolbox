import { useMemo, useState } from 'react';
import { ActionIcon, Button, Group, Menu, Modal, NumberInput, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDots, IconMail, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { db } from '../db/db';
import type { LabInvoice, LabInvoiceStatus } from '../db/types';
import { LAB_STATUS, LabStatusBadge, PageHeader, StatTile, EmptyState, copyText } from '../components/common';
import { useEverything } from '../hooks/useData';
import { daysBetween, formatDate, nowIso, toDateStr, todayStr } from '../lib/dates';
import { money, uid } from '../lib/format';
import { matchProject } from '../lib/matching';

const STATUS_OPTIONS = (Object.keys(LAB_STATUS) as LabInvoiceStatus[]).map((k) => ({ value: k, label: LAB_STATUS[k].label }));

/** The e-mail to AP for an invoice, ready to paste. */
export function apEmail(inv: LabInvoice, apTo: string): string {
  return `To: ${apTo}\nSubject: Initiate Invoice: ${inv.invoiceNo ?? ''}\nAttach: ${inv.lab ?? 'Lab'} Invoice - ${inv.invoiceNo ?? ''}.pdf\n\nPlease initiate payment for attached invoice.\nPO#: ${inv.po ?? '(PO needed)'}\n\nRegards,\n`;
}

export function LabInvoicesPage() {
  const { labInvoices, projects, rows, settings, today } = useEverything();
  const [filter, setFilter] = useState<'open' | 'all' | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<LabInvoice | null>(null);

  // open ones first; everything when there are none open
  const anyOpen = labInvoices.some((i) => i.status !== 'paid' && i.status !== 'sent' && i.status !== 'na');
  const effectiveFilter = filter ?? (anyOpen ? 'open' : 'all');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return labInvoices
      .filter((i) => (effectiveFilter === 'all' || (i.status !== 'paid' && i.status !== 'sent' && i.status !== 'na')) && (!s || `${i.projectName} ${i.invoiceNo ?? ''} ${i.labRef ?? ''} ${i.po ?? ''} ${i.roundType ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(s)))
      .sort((a, b) => (b.invoiceDate ?? b.roundDate ?? '').localeCompare(a.invoiceDate ?? a.roundDate ?? ''));
  }, [labInvoices, effectiveFilter, q]);
  const waiting = labInvoices.filter((i) => i.status === 'received');
  const overdue = waiting.filter((i) => i.invoiceDate && daysBetween(i.invoiceDate, today) > settings.apOverdueDays);
  const awaiting = labInvoices.filter((i) => i.status === 'awaiting');
  const total = labInvoices.filter((i) => (i.invoiceDate ?? '') >= `${today.slice(0, 4)}-01-01`).reduce((a, i) => a + (i.amount ?? 0), 0);

  const newInvoice = (): LabInvoice => {
    const now = nowIso();
    return { id: uid(), projectName: '', status: 'received', lab: 'Hill Labs', roundDate: todayStr(), invoiceDate: todayStr(), createdAt: now, updatedAt: now };
  };
  const copyEmail = async (inv: LabInvoice) => {
    const ok = await copyText(apEmail(inv, settings.apEmail));
    notifications.show({ message: ok ? 'AP e-mail copied – paste it into Outlook and attach the invoice' : 'Could not copy', color: ok ? 'teal' : 'red' });
  };
  const markSent = (inv: LabInvoice) => db.labInvoices.put({ ...inv, status: 'sent', sentToAp: inv.sentToAp ?? todayStr(), updatedAt: nowIso() });

  return (
    <Stack gap="md">
      <PageHeader
        title="Lab invoices"
        description="Every lab invoice from a monitoring round, through to accounts payable. Log it when it arrives, copy the AP e-mail, and mark it sent."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing(newInvoice())}>
            Log an invoice
          </Button>
        }
      />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatTile label="Received, not sent to AP" value={waiting.length} sub={overdue.length ? `${overdue.length} older than ${settings.apOverdueDays} days` : 'none overdue'} color={overdue.length ? 'red' : waiting.length ? 'orange' : 'teal'} />
        <StatTile label="Awaiting the lab" value={awaiting.length} sub="rounds logged, invoice not here yet" />
        <StatTile label="Queried / on hold" value={labInvoices.filter((i) => i.status === 'query').length} />
        <StatTile label={`Invoiced this year`} value={money(total)} sub="excl GST, by invoice date" />
      </SimpleGrid>
      <Group gap="xs">
        <TextInput placeholder="Search project, invoice, PO, notes…" value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: '1 1 220px' }} />
        <SegmentedControl value={effectiveFilter} onChange={(v) => setFilter(v as 'open' | 'all')} data={[{ label: 'Open', value: 'open' }, { label: 'All', value: 'all' }]} />
      </Group>
      {!labInvoices.length ? (
        <EmptyState title="No lab invoices logged">Import the monitoring spreadsheet (its Lab Invoice Tracker sheet is picked up), or log one here when it arrives.</EmptyState>
      ) : (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <ScrollArea type="auto">
            <table className="pm-grid">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Project</th>
                  <th>Type / round</th>
                  <th>Lab</th>
                  <th>Invoice #</th>
                  <th>Invoice date</th>
                  <th className="num">Amount</th>
                  <th>PO</th>
                  <th>Status</th>
                  <th>Sent to AP</th>
                  <th className="num">Days</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const days = i.invoiceDate && i.status === 'received' ? daysBetween(i.invoiceDate, today) : undefined;
                  return (
                    <tr key={i.id}>
                      <td>{formatDate(i.roundDate)}</td>
                      <td>
                        <Text size="sm" fw={600} span>
                          {i.projectName}
                        </Text>
                        {i.jobCode && (
                          <Text size="xs" c="dimmed">
                            {i.jobCode}
                          </Text>
                        )}
                      </td>
                      <td className="wrap">{i.roundType}</td>
                      <td>{i.lab}</td>
                      <td>{i.invoiceNo}</td>
                      <td>{formatDate(i.invoiceDate)}</td>
                      <td className="num">{money(i.amount, true)}</td>
                      <td>{i.po ?? <Text size="xs" c="red" span>none</Text>}</td>
                      <td style={{ minWidth: 190 }}>
                        <LabStatusBadge status={i.status} />
                      </td>
                      <td>{formatDate(i.sentToAp)}</td>
                      <td className="num" style={{ color: days !== undefined && days > settings.apOverdueDays ? 'var(--mantine-color-red-7)' : undefined }}>
                        {days ?? ''}
                      </td>
                      <td className="wrap" title={i.notes} style={{ maxWidth: 300 }}>
                        <Text size="xs" c="dimmed" lineClamp={2} style={{ whiteSpace: 'normal' }}>
                          {i.notes}
                        </Text>
                      </td>
                      <td>
                        <Group gap={4} wrap="nowrap">
                          {i.status === 'received' && (
                            <Button size="compact-xs" variant="light" onClick={() => copyEmail(i).then(() => markSent(i))} title="Copy the AP e-mail and mark as sent">
                              <IconMail size={13} />
                              &nbsp;Send to AP
                            </Button>
                          )}
                          <Menu>
                            <Menu.Target>
                              <ActionIcon variant="subtle" size="sm" aria-label="More">
                                <IconDots size={14} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(i)}>
                                Edit
                              </Menu.Item>
                              <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => copyEmail(i)}>
                                Copy AP e-mail
                              </Menu.Item>
                              <Menu.Label>Status</Menu.Label>
                              {STATUS_OPTIONS.map((o) => (
                                <Menu.Item key={o.value} disabled={o.value === i.status} onClick={() => db.labInvoices.put({ ...i, status: o.value as LabInvoiceStatus, sentToAp: o.value === 'sent' ? i.sentToAp ?? todayStr() : i.sentToAp, updatedAt: nowIso() })}>
                                  {o.label}
                                </Menu.Item>
                              ))}
                              <Menu.Divider />
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => db.labInvoices.delete(i.id)}>
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && (
                  <tr>
                    <td colSpan={13}>
                      <Text size="sm" c="dimmed" p="md">
                        Nothing open – everything has gone to AP.
                      </Text>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ScrollArea>
        </Paper>
      )}
      {editing && (
        <EditInvoice
          inv={editing}
          onClose={() => setEditing(null)}
          names={[...new Set([...rows.map((r) => r.name), ...labInvoices.map((i) => i.projectName), ...projects.filter((p) => p.mine).map((p) => p.name)])].filter(Boolean).sort()}
          lookup={(name) => {
            const row = rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
            const p = row?.projectId ? projects.find((x) => x.id === row.projectId) : projects.find((x) => x.name === name) ?? matchProject(name, projects);
            return { jobCode: row?.jobCode ?? p?.jobCode ?? p?.id, po: row?.po ?? p?.po, projectId: p?.id ?? row?.projectId };
          }}
        />
      )}
    </Stack>
  );
}

function EditInvoice({ inv, onClose, names, lookup }: { inv: LabInvoice; onClose: () => void; names: string[]; lookup: (name: string) => { jobCode?: string; po?: string; projectId?: string } }) {
  const [v, setV] = useState<LabInvoice>(inv);
  const set = (patch: Partial<LabInvoice>) => setV((x) => ({ ...x, ...patch }));
  const date = (s?: string) => (s ? new Date(s + 'T00:00:00') : null);
  const save = async () => {
    if (!v.projectName.trim()) return;
    await db.labInvoices.put({ ...v, updatedAt: nowIso() });
    onClose();
  };
  return (
    <Modal opened onClose={onClose} title={inv.invoiceNo || inv.projectName ? 'Lab invoice' : 'Log a lab invoice'} size="lg">
      <Stack gap="xs">
        <Select
          label="Project"
          data={names}
          value={names.includes(v.projectName) ? v.projectName : null}
          searchable
          onChange={(name) => {
            if (!name) return;
            const l = lookup(name);
            set({ projectName: name, jobCode: l.jobCode ?? v.jobCode, po: l.po ?? v.po, projectId: l.projectId ?? v.projectId });
          }}
          placeholder="Pick from the schedule, or type a name below"
        />
        <TextInput label="Project name (as on the invoice)" value={v.projectName} onChange={(e) => set({ projectName: e.currentTarget.value })} required />
        <SimpleGrid cols={2} spacing="xs">
          <TextInput label="Job code" value={v.jobCode ?? ''} onChange={(e) => set({ jobCode: e.currentTarget.value || undefined })} />
          <TextInput label="Purchase order" value={v.po ?? ''} onChange={(e) => set({ po: e.currentTarget.value || undefined })} placeholder="Needed before AP can pay" />
          <DateInput label="Monitoring round date" value={date(v.roundDate)} onChange={(d) => set({ roundDate: d ? toDateStr(d) : undefined })} valueFormat="D MMM YYYY" clearable />
          <TextInput label="Monitoring type / round" value={v.roundType ?? ''} onChange={(e) => set({ roundType: e.currentTarget.value || undefined })} placeholder="e.g. Groundwater – GW2" />
          <TextInput label="Lab" value={v.lab ?? ''} onChange={(e) => set({ lab: e.currentTarget.value || undefined })} />
          <TextInput label="Lab job / reference" value={v.labRef ?? ''} onChange={(e) => set({ labRef: e.currentTarget.value || undefined })} />
          <TextInput label="Invoice number" value={v.invoiceNo ?? ''} onChange={(e) => set({ invoiceNo: e.currentTarget.value || undefined })} />
          <DateInput label="Invoice date" value={date(v.invoiceDate)} onChange={(d) => set({ invoiceDate: d ? toDateStr(d) : undefined })} valueFormat="D MMM YYYY" clearable />
          <NumberInput label="Amount (excl GST)" value={v.amount ?? ''} onChange={(n) => set({ amount: typeof n === 'number' ? n : undefined })} prefix="$" thousandSeparator decimalScale={2} />
          <Select label="Status" data={STATUS_OPTIONS} value={v.status} onChange={(s) => s && set({ status: s as LabInvoiceStatus })} />
          <DateInput label="Date sent to AP" value={date(v.sentToAp)} onChange={(d) => set({ sentToAp: d ? toDateStr(d) : undefined })} valueFormat="D MMM YYYY" clearable />
        </SimpleGrid>
        <Textarea label="Notes" autosize minRows={2} value={v.notes ?? ''} onChange={(e) => set({ notes: e.currentTarget.value || undefined })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!v.projectName.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
