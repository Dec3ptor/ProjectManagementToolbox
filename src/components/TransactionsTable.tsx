// Every transaction, filterable, with a switch on each to turn its billability on or off.

import { useMemo, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Menu, MultiSelect, Paper, ScrollArea, SegmentedControl, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDownload, IconDots, IconSearch, IconX } from '@tabler/icons-react';
import { db } from '../db/db';
import type { Transaction } from '../db/types';
import { isBillable, isUnbilled, pendingChanges, totals, type OverrideMap } from '../lib/billability';
import { formatDate, nowIso } from '../lib/dates';
import { hours, money, num } from '../lib/format';
import { writeWorkbook } from '../importers/xlsx';
import { copyText, download } from './common';

export async function setBillable(t: Transaction, billable: boolean, note?: string) {
  if (billable === t.sourceBillable && !note) await db.overrides.delete(t.id);
  else await db.overrides.put({ id: t.id, projectId: t.projectId, billable, note, at: nowIso() });
}

export function TransactionsTable({ txns, overrides, showProject, compact }: { txns: Transaction[]; overrides: OverrideMap; showProject?: boolean; compact?: boolean }) {
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [status, setStatus] = useState<'all' | 'unbilled' | 'billed'>('all');
  const [billing, setBilling] = useState<'all' | 'billable' | 'non' | 'changed'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const peopleOptions = useMemo(() => [...new Set(txns.map((t) => t.person || t.supplier || t.type))].filter(Boolean).sort(), [txns]);
  const taskOptions = useMemo(() => [...new Set(txns.map((t) => `${t.taskName} (${t.taskNumber})`))].sort(), [txns]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txns
      .filter((t) => {
        if (people.length && !people.includes(t.person || t.supplier || t.type)) return false;
        if (tasks.length && !tasks.includes(`${t.taskName} (${t.taskNumber})`)) return false;
        if (status === 'unbilled' && !isUnbilled(t)) return false;
        if (status === 'billed' && isUnbilled(t)) return false;
        const b = isBillable(t, overrides);
        if (billing === 'billable' && !b) return false;
        if (billing === 'non' && b) return false;
        if (billing === 'changed' && b === t.sourceBillable) return false;
        if (q && !`${t.comment ?? ''} ${t.person ?? ''} ${t.supplier ?? ''} ${t.taskName} ${t.id} ${t.type} ${t.projectId}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }, [txns, people, tasks, status, billing, search, overrides]);

  const sum = useMemo(() => totals(shown, overrides), [shown, overrides]);
  const pending = useMemo(() => pendingChanges(txns, overrides), [txns, overrides]);

  const toggleAll = (on: boolean) => setSelected(on ? new Set(shown.map((t) => t.id)) : new Set());
  const bulk = async (billable: boolean) => {
    const list = shown.filter((t) => selected.has(t.id));
    for (const t of list) await setBillable(t, billable);
    notifications.show({ message: `${list.length} marked ${billable ? 'billable' : 'non-billable'}`, color: 'teal' });
    setSelected(new Set());
  };

  const exportXlsx = () => {
    const rows: unknown[][] = [['Date', 'Project', 'Person / resource', 'Task', 'Task #', 'Type', 'Qty', 'Unit', 'Cost', 'Bill amount', 'Invoice status', 'Billable (as it stands)', 'Billable (export)', 'Comment', 'Txn #']];
    for (const t of shown) rows.push([t.date, t.projectId, t.person || t.supplier || '', t.taskName, t.taskNumber, t.type, t.quantity, t.uom, t.cost, t.effort, t.invoicingStatus, isBillable(t, overrides) ? 'Y' : 'N', t.sourceBillable ? 'Y' : 'N', t.comment ?? '', t.id]);
    download('transactions.xlsx', writeWorkbook([{ name: 'Transactions', rows }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const copyPending = async () => {
    const ok = await copyText(pending.map((p) => p.txn.id).join(', '));
    notifications.show({ message: ok ? `${pending.length} transaction numbers copied – change these in the finance system` : 'Could not copy', color: ok ? 'teal' : 'red' });
  };

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        <TextInput placeholder="Search comments, people, tasks…" leftSection={<IconSearch size={14} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} rightSection={search ? <ActionIcon variant="subtle" size="sm" onClick={() => setSearch('')}><IconX size={12} /></ActionIcon> : null} style={{ flex: '1 1 200px' }} size="sm" />
        <MultiSelect placeholder="Person" data={peopleOptions} value={people} onChange={setPeople} clearable searchable size="sm" style={{ flex: '1 1 180px' }} />
        <MultiSelect placeholder="Task" data={taskOptions} value={tasks} onChange={setTasks} clearable searchable size="sm" style={{ flex: '1 1 180px' }} />
        <SegmentedControl size="xs" value={status} onChange={(v) => setStatus(v as typeof status)} data={[{ label: 'All', value: 'all' }, { label: 'Unbilled', value: 'unbilled' }, { label: 'Invoiced', value: 'billed' }]} />
        <SegmentedControl size="xs" value={billing} onChange={(v) => setBilling(v as typeof billing)} data={[{ label: 'All', value: 'all' }, { label: 'Billable', value: 'billable' }, { label: 'Non-billable', value: 'non' }, { label: `Changed${pending.length ? ` (${pending.length})` : ''}`, value: 'changed' }]} />
        <Menu>
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label="More">
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportXlsx}>
              Download what’s shown (Excel)
            </Menu.Item>
            <Menu.Item leftSection={<IconCopy size={14} />} onClick={copyPending} disabled={!pending.length}>
              Copy changed transaction numbers ({pending.length})
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Group gap="md" justify="space-between" wrap="wrap">
        <Text size="sm" c="dimmed" className="tabular">
          {shown.length} of {txns.length} · {hours(sum.hours)} ({hours(sum.billableHours)} billable) · cost {money(sum.cost)} · bill {money(sum.billableEffort)} · unbilled {money(sum.unbilledEffort)}
        </Text>
        {selected.size > 0 && (
          <Group gap="xs">
            <Text size="sm">{selected.size} selected</Text>
            <Button size="xs" variant="light" color="gray" onClick={() => bulk(false)}>
              Mark non-billable
            </Button>
            <Button size="xs" variant="light" color="teal" onClick={() => bulk(true)}>
              Mark billable
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </Group>
        )}
      </Group>
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea h={compact ? 360 : 'min(70vh, 720px)'} type="auto">
          <table className="pm-grid">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <Checkbox size="xs" checked={shown.length > 0 && selected.size === shown.length} indeterminate={selected.size > 0 && selected.size < shown.length} onChange={(e) => toggleAll(e.currentTarget.checked)} aria-label="Select all" />
                </th>
                <th>Date</th>
                {showProject && <th>Project</th>}
                <th>Person / resource</th>
                <th>Task</th>
                <th>Type</th>
                <th className="num">Qty</th>
                <th className="num">Cost</th>
                <th className="num">Bill</th>
                <th>Invoicing</th>
                <th>Billable</th>
                <th>Comment</th>
                <th>Txn #</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const b = isBillable(t, overrides);
                const changed = b !== t.sourceBillable;
                return (
                  <tr key={t.id} className={b ? undefined : 'off'}>
                    <td>
                      <Checkbox
                        size="xs"
                        checked={selected.has(t.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.currentTarget.checked) next.add(t.id);
                          else next.delete(t.id);
                          setSelected(next);
                        }}
                        aria-label="Select"
                      />
                    </td>
                    <td>{formatDate(t.date)}</td>
                    {showProject && <td title={t.projectId}>{t.projectId.replace(/^NZL-WSP-/, '')}</td>}
                    <td>{t.person || t.supplier || '–'}</td>
                    <td title={t.taskNumber}>{t.taskName}</td>
                    <td>{t.type}</td>
                    <td className="num">
                      {num(t.quantity)} {t.uom === 'HOURS' ? 'h' : t.uom === 'KM' ? 'km' : ''}
                    </td>
                    <td className="num">{money(t.cost, true)}</td>
                    <td className="num money">{money(t.effort, true)}</td>
                    <td>
                      <Text size="xs" c={isUnbilled(t) ? 'orange' : 'dimmed'} span>
                        {t.invoicingStatus}
                        {t.arInvoiceNumber ? ` · ${t.arInvoiceNumber}` : ''}
                      </Text>
                    </td>
                    <td>
                      <Tooltip label={changed ? `Changed here (the export says ${t.sourceBillable ? 'billable' : 'non-billable'})` : t.effortLogic ?? ''} disabled={!changed && !t.effortLogic}>
                        <Switch size="xs" checked={b} onChange={(e) => setBillable(t, e.currentTarget.checked)} color={changed ? 'orange' : 'teal'} label={changed ? '*' : undefined} aria-label="Billable" />
                      </Tooltip>
                    </td>
                    <td className="wrap" title={t.comment?.trim()}>
                      <Text size="xs" lineClamp={2} style={{ whiteSpace: 'normal' }}>
                        {t.comment?.trim()}
                      </Text>
                    </td>
                    <td>
                      <Text size="xs" c="dimmed" span className="tabular">
                        {t.id}
                      </Text>
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={13}>
                    <Text size="sm" c="dimmed" p="md">
                      Nothing matches.
                    </Text>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Paper>
    </Stack>
  );
}
