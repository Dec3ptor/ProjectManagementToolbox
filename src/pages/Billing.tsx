import { useMemo, useState } from 'react';
import { Accordion, Badge, Button, Card, Checkbox, Group, NumberInput, Paper, Progress, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { IconCopy, IconDownload } from '@tabler/icons-react';
import { db } from '../db/db';
import type { BillingCycle, BillingStep } from '../db/types';
import { PageHeader, StatTile, EmptyState, copyText, download } from '../components/common';
import { TransactionsTable } from '../components/TransactionsTable';
import { projectPath, useEverything } from '../hooks/useData';
import { BILLING_STEPS, billingDueDate, billingMonths, currentBillingMonth, cycleId, monthBilling, type ProjectBilling } from '../lib/billing';
import { pendingChanges } from '../lib/billability';
import { daysBetween, formatDate, formatMonth, nowIso } from '../lib/dates';
import { money, num, plural, shortName } from '../lib/format';
import { writeWorkbook } from '../importers/xlsx';

export function BillingPage() {
  const { month: param } = useParams();
  const navigate = useNavigate();
  const { projects, txns, overrides, cycles, settings, today } = useEverything();
  const month = param ?? currentBillingMonth(today);
  const months = useMemo(() => billingMonths(txns, cycles, today), [txns, cycles, today]);
  const rows = useMemo(() => monthBilling(month, projects, txns, overrides, cycles), [month, projects, txns, overrides, cycles]);
  const due = billingDueDate(month, settings);
  const daysLeft = daysBetween(today, due);
  const done = rows.filter((r) => r.done).length;
  const toBill = rows.reduce((a, r) => a + (r.done ? 0 : r.fixedFee ? r.thisMonthEffort : r.thisMonthEffort + r.olderEffort), 0);
  const [open, setOpen] = useState<string | null>(null);

  const exportMonth = () => {
    const sheet: unknown[][] = [['Project', 'Project #', 'This month billable', 'Carried over', 'Hours this month', 'Non-billable hours', 'Steps done', 'Invoice amount', 'Invoice #', 'Notes']];
    for (const r of rows) sheet.push([r.project.name, r.project.id, r.thisMonthEffort, r.olderEffort, r.thisMonthHours, r.nonBillableHours, r.cycle?.skipped ? 'Nothing to bill' : BILLING_STEPS.filter((s) => r.cycle?.steps[s.key]).map((s) => s.label).join(', '), r.cycle?.invoiceAmount ?? '', r.cycle?.invoiceNumber ?? '', r.cycle?.notes ?? '']);
    const lines: unknown[][] = [['Project #', 'Date', 'Person / resource', 'Task', 'Type', 'Qty', 'Unit', 'Cost', 'Bill amount', 'Invoice status', 'Comment', 'Txn #']];
    for (const r of rows) for (const t of [...r.thisMonth, ...r.older]) lines.push([t.projectId, t.date, t.person || t.supplier || '', t.taskName, t.type, t.quantity, t.uom, t.cost, t.effort, t.invoicingStatus, t.comment ?? '', t.id]);
    download(`billing-${month}.xlsx`, writeWorkbook([{ name: 'Summary', rows: sheet }, { name: 'Unbilled lines', rows: lines }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Monthly billing"
        description="At the start of each month: review the month’s time and costs on each project, turn off what shouldn’t be charged, send it for invoicing, and tick it off."
        actions={
          <Group gap="xs">
            <Select value={month} onChange={(v) => v && navigate(`/billing/${v}`)} data={months.map((m) => ({ value: m, label: formatMonth(m, true) + (m === currentBillingMonth(today) ? ' (now)' : '') }))} w={220} />
            <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportMonth} disabled={!rows.length}>
              Excel
            </Button>
          </Group>
        }
      />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatTile label="Projects done" value={`${done} / ${rows.length}`} color={rows.length && done === rows.length ? 'teal' : undefined} />
        <StatTile label="Still to bill" value={money(toBill)} sub="not yet invoiced on projects not ticked off (fixed-fee: this month’s work)" />
        <StatTile label="Due" value={formatDate(due)} sub={daysLeft < 0 ? `${plural(-daysLeft, 'day')} overdue` : daysLeft === 0 ? 'Today' : `in ${plural(daysLeft, 'day')}`} color={daysLeft < 0 && done < rows.length ? 'red' : undefined} />
        <StatTile label="Non-billable hours" value={num(rows.reduce((a, r) => a + r.nonBillableHours, 0), 1)} sub={`in ${formatMonth(month)} across your projects`} />
      </SimpleGrid>
      {!rows.length && <EmptyState title="No projects to bill">Projects marked as yours (and active) appear here. Import an Effort Report, or tick “mine” on the Projects page.</EmptyState>}
      <Accordion variant="separated" value={open} onChange={setOpen} chevronPosition="left">
        {rows.map((r) => (
          <Accordion.Item key={r.project.id} value={r.project.id}>
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={600} size="sm" truncate>
                    {shortName(r.project.name)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {money(r.thisMonthEffort)} of work this month{!r.fixedFee && r.olderEffort > 0 ? ` + ${money(r.olderEffort)} carried over` : ''} · {num(r.thisMonthHours, 1)} h{r.nonBillableHours ? ` · ${num(r.nonBillableHours, 1)} h non-billable` : ''}
                    {r.fixedFee ? ' · fixed fee – invoice by % complete' : r.project.billPlanMethod ? ` · ${r.project.billPlanMethod}` : ''}
                  </Text>
                </div>
                <Group gap="xs" wrap="nowrap" visibleFrom="sm">
                  {r.done ? (
                    <Badge color="teal" variant="filled">
                      {r.cycle?.skipped ? 'Nothing to bill' : 'Invoiced'}
                    </Badge>
                  ) : (
                    <Tooltip label={`${Math.round(r.progress * BILLING_STEPS.length)} of ${BILLING_STEPS.length} steps`}>
                      <Progress value={r.progress * 100} w={100} size="md" />
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ProjectBillingPanel row={r} month={month} overrides={overrides} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

function ProjectBillingPanel({ row: r, month, overrides }: { row: ProjectBilling; month: string; overrides: ReturnType<typeof useEverything>['overrides'] }) {
  const id = cycleId(month, r.project.id);
  const cycle: BillingCycle = r.cycle ?? { id, month, projectId: r.project.id, steps: {}, updatedAt: '' };
  const save = (patch: Partial<BillingCycle>) => db.billing.put({ ...cycle, ...patch, updatedAt: nowIso() });
  const setStep = (key: BillingStep, on: boolean) => {
    const steps = { ...cycle.steps };
    if (on) steps[key] = nowIso();
    else delete steps[key];
    return save({ steps, skipped: false });
  };
  const monthTxns = useMemo(() => [...r.thisMonth, ...r.older, ...r.nonBillable], [r]);
  const pending = useMemo(() => pendingChanges(monthTxns, overrides), [monthTxns, overrides]);
  const copyPending = async () => {
    const ok = await copyText(pending.map((p) => `${p.txn.id}\t${p.override.billable ? 'Billable' : 'Non-billable'}\t${p.txn.person ?? p.txn.supplier ?? ''}\t${p.txn.date}\t${p.txn.effort}`).join('\n'));
    notifications.show({ message: ok ? 'Copied – paste into the finance system or your e-mail to the PFA' : 'Could not copy', color: ok ? 'teal' : 'red' });
  };
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card padding="md">
          <Text fw={600} size="sm" mb="xs">
            Steps
          </Text>
          <Stack gap="xs">
            {BILLING_STEPS.map((s) => (
              <Checkbox key={s.key} label={s.label} description={cycle.steps[s.key] ? `Done ${formatDate(cycle.steps[s.key]!.slice(0, 10))}` : s.hint} checked={!!cycle.steps[s.key]} onChange={(e) => setStep(s.key, e.currentTarget.checked)} disabled={cycle.skipped} />
            ))}
            <Checkbox label="Nothing to bill this month" checked={!!cycle.skipped} onChange={(e) => save({ skipped: e.currentTarget.checked })} mt={4} />
          </Stack>
        </Card>
        <Card padding="md">
          <Text fw={600} size="sm" mb="xs">
            Invoice
          </Text>
          <Stack gap="xs">
            <NumberInput label="Invoice amount (excl GST)" value={cycle.invoiceAmount ?? ''} onChange={(v) => save({ invoiceAmount: typeof v === 'number' ? v : undefined })} prefix="$" thousandSeparator decimalScale={2} />
            <TextInput label="Invoice number" defaultValue={cycle.invoiceNumber ?? ''} onBlur={(e) => e.currentTarget.value !== (cycle.invoiceNumber ?? '') && save({ invoiceNumber: e.currentTarget.value || undefined })} />
            <Textarea label="Notes" autosize minRows={2} defaultValue={cycle.notes ?? ''} onBlur={(e) => e.currentTarget.value !== (cycle.notes ?? '') && save({ notes: e.currentTarget.value || undefined })} placeholder="Anything to remember – who it went to, what was held back…" />
          </Stack>
        </Card>
      </SimpleGrid>
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" mb={pending.length ? 'xs' : 0} wrap="wrap">
          <Text size="sm" fw={600}>
            {pending.length ? `${plural(pending.length, 'change')} to make in the finance system` : 'No billability changes pending for this month'}
          </Text>
          <Group gap="xs">
            {pending.length > 0 && (
              <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={copyPending}>
                Copy list
              </Button>
            )}
            <Button size="xs" variant="subtle" component={Link} to={`${projectPath(r.project.id)}/transactions`}>
              All transactions
            </Button>
          </Group>
        </Group>
        {pending.length > 0 && (
          <Text size="xs" c="dimmed">
            {pending.map((p) => `${p.txn.id} → ${p.override.billable ? 'billable' : 'non-billable'}`).join(' · ')}
          </Text>
        )}
      </Paper>
      <div>
        <Text size="sm" fw={600} mb="xs">
          The month’s lines (and anything older still unbilled)
        </Text>
        <TransactionsTable txns={monthTxns} overrides={overrides} compact />
      </div>
    </Stack>
  );
}
