import { useMemo, useState } from 'react';
import { Accordion, Alert, Badge, Button, Card, Checkbox, Group, NumberInput, Paper, Progress, ScrollArea, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
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
import { money, num, pct, plural, shortName } from '../lib/format';
import { feeTotal, type TaskClaim } from '../lib/tasks';
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
  const toBill = rows.reduce((a, r) => a + (r.done ? 0 : r.toInvoice), 0);
  const [open, setOpen] = useState<string | null>(null);

  const exportMonth = () => {
    const sheet: unknown[][] = [['Project', 'Project #', 'Billing', 'To invoice', 'This month billable', 'Carried over', 'Hours this month', 'Non-billable hours', 'Steps done', 'Invoice amount', 'Invoice #', 'Notes']];
    for (const r of rows) sheet.push([r.project.name, r.project.id, r.mode === 'task' ? 'Per task' : 'Time & costs', r.toInvoice, r.thisMonthEffort, r.olderEffort, r.thisMonthHours, r.nonBillableHours, r.cycle?.skipped ? 'Nothing to bill' : BILLING_STEPS.filter((s) => r.cycle?.steps[s.key]).map((s) => s.label).join(', '), r.cycle?.invoiceAmount ?? '', r.cycle?.invoiceNumber ?? '', r.cycle?.notes ?? '']);
    const lines: unknown[][] = [['Project #', 'Date', 'Person / resource', 'Task', 'Type', 'Qty', 'Unit', 'Cost', 'Bill amount', 'Invoice status', 'Comment', 'Txn #']];
    for (const r of rows) for (const t of [...r.thisMonth, ...r.older]) lines.push([t.projectId, t.date, t.person || t.supplier || '', t.taskName, t.type, t.quantity, t.uom, t.cost, t.effort, t.invoicingStatus, t.comment ?? '', t.id]);
    const claims: unknown[][] = [['Project #', 'Task #', 'Task', 'Quoted fee', '% before', '% now', 'Claim this month', 'Claimed to date', 'Cost to date']];
    for (const r of rows) for (const c of r.claims) claims.push([r.project.id, c.taskNumber, c.taskName, c.fee, c.previousPct, c.pct, c.amount, c.claimedToDate, c.costToDate]);
    download(`billing-${month}.xlsx`, writeWorkbook([{ name: 'Summary', rows: sheet }, { name: 'Task claims', rows: claims }, { name: 'Unbilled lines', rows: lines }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
        <StatTile label="Still to bill" value={money(toBill)} sub="task claims plus billable lines not yet invoiced, on projects not ticked off" />
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
                    {r.mode === 'task'
                      ? `${r.cycle?.taskProgress ? `${money(r.toInvoice)} to claim` : 'Per task – enter % complete'} · ${money(r.thisMonthEffort)} of work this month · ${num(r.thisMonthHours, 1)} h`
                      : `${money(r.thisMonthEffort)} this month${r.olderEffort > 0 ? ` + ${money(r.olderEffort)} carried over` : ''} · ${num(r.thisMonthHours, 1)} h${r.nonBillableHours ? ` · ${num(r.nonBillableHours, 1)} h non-billable` : ''}`}
                    {r.project.billPlanMethod ? ` · ${r.project.billPlanMethod}` : ''}
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
  const saveProgress = (taskNumber: string, value: number | undefined) => {
    const taskProgress = { ...(cycle.taskProgress ?? {}) };
    if (value === undefined) delete taskProgress[taskNumber];
    else taskProgress[taskNumber] = Math.max(0, Math.min(100, value));
    return save({ taskProgress });
  };
  return (
    <Stack gap="md">
      {r.mode === 'task' && <TaskClaims claims={r.claims} projectId={r.project.id} onChange={saveProgress} entered={!!cycle.taskProgress} />}
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
            <NumberInput label="Invoice amount (excl GST)" value={cycle.invoiceAmount ?? ''} onChange={(v) => save({ invoiceAmount: typeof v === 'number' ? v : undefined })} prefix="$" thousandSeparator decimalScale={2} placeholder={r.mode === 'task' && r.toInvoice ? `${Math.round(r.toInvoice)} from the task claims` : undefined} />
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
          {r.mode === 'task' ? 'The month’s time and costs (for reference – the claim is per task above)' : 'The month’s lines (and anything older still unbilled)'}
        </Text>
        <TransactionsTable txns={monthTxns} overrides={overrides} compact />
      </div>
    </Stack>
  );
}

/** Per-task projects: each task's quoted fee and the % complete to claim this month. */
function TaskClaims({ claims, projectId, onChange, entered }: { claims: TaskClaim[]; projectId: string; onChange: (taskNumber: string, pct: number | undefined) => void; entered: boolean }) {
  const total = claims.reduce((a, c) => a + c.amount, 0);
  const noFees = !claims.some((c) => c.fee > 0);
  return (
    <Card padding="md">
      <Group justify="space-between" mb="xs" wrap="wrap">
        <div>
          <Text fw={600} size="sm">
            Claim by task: % complete
          </Text>
          <Text size="xs" c="dimmed">
            Enter where each task stands now (cumulative). This month’s claim is the fee times the percentage added since the last claim.
          </Text>
        </div>
        <Group gap="md">
          <Text size="sm" className="tabular">
            Quoted <b>{money(feeTotal(claims))}</b>
          </Text>
          <Text size="sm" className="tabular" c={total > 0 ? 'teal' : undefined}>
            This month <b>{money(total, true)}</b>
          </Text>
          <Button size="xs" variant="subtle" component={Link} to={`${projectPath(projectId)}/details`}>
            Quoted fees
          </Button>
        </Group>
      </Group>
      {noFees && (
        <Alert color="yellow" mb="sm" p="xs">
          No quoted fees yet. Set each task’s fee in the project’s <Link to={`${projectPath(projectId)}/details`}>Details</Link>; tasks with time on them are listed here already.
        </Alert>
      )}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea type="auto">
          <table className="pm-grid">
            <thead>
              <tr>
                <th>Task</th>
                <th className="num">Quoted fee</th>
                <th className="num">Claimed before</th>
                <th className="num" style={{ width: 130 }}>
                  % complete now
                </th>
                <th className="num">Claim this month</th>
                <th className="num">Claimed to date</th>
                <th className="num">Left to claim</th>
                <th className="num">Cost to date</th>
                <th className="num">Cost vs fee</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const over = c.fee > 0 && c.costToDate > c.fee;
                return (
                  <tr key={c.taskNumber}>
                    <td>
                      {c.taskName}
                      <Text size="xs" c="dimmed">
                        {c.taskNumber}
                        {c.hoursToDate ? ` · ${num(c.hoursToDate, 1)} h` : ''}
                      </Text>
                    </td>
                    <td className="num">{c.fee ? money(c.fee) : <Text size="xs" c="dimmed" span>not set</Text>}</td>
                    <td className="num">{pct(c.previousPct, false)}</td>
                    <td className="num">
                      <NumberInput size="xs" value={c.pct} min={0} max={100} suffix="%" onChange={(v) => onChange(c.taskNumber, typeof v === 'number' ? v : undefined)} w={100} style={{ marginLeft: 'auto' }} />
                    </td>
                    <td className="num" style={{ fontWeight: c.amount ? 600 : undefined }}>
                      {money(c.amount, true)}
                    </td>
                    <td className="num">{money(c.claimedToDate)}</td>
                    <td className="num">{money(c.remaining)}</td>
                    <td className="num">{money(c.costToDate)}</td>
                    <td className="num" style={{ color: over ? 'var(--mantine-color-red-7)' : undefined }}>
                      {c.fee ? pct(c.costToDate / c.fee) : '–'}
                    </td>
                  </tr>
                );
              })}
              {!claims.length && (
                <tr>
                  <td colSpan={9}>
                    <Text size="sm" c="dimmed" p="sm">
                      No tasks yet – add quoted fees in the project’s Details.
                    </Text>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Paper>
      {!entered && claims.length > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          Nothing entered for this month yet: the percentages shown are where things stood after the last claim.
        </Text>
      )}
    </Card>
  );
}
