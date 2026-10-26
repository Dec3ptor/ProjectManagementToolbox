import { useMemo, useState } from 'react';
import { ActionIcon, Anchor, Badge, Button, Card, Center, Group, Loader, NumberInput, Paper, Progress, ScrollArea, Select, SimpleGrid, Stack, Switch, Tabs, Text, Textarea, TextInput, Title, useMantineColorScheme } from '@mantine/core';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { modals } from '@mantine/modals';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { db } from '../../db/db';
import type { BillingMode, Project, TaskFee } from '../../db/types';
import { billingMode, previousProgress } from '../../lib/tasks';
import { useCycles, useLabInvoices, useOverrides, useProject, useSettings, useTransactions } from '../../hooks/useData';
import { currentBillingMonth } from '../../lib/billing';
import { addMonths as addM } from '../../lib/dates';
import { PageHeader, StatTile, HealthBadge, EmptyState, LabStatusBadge } from '../../components/common';
import { TransactionsTable } from '../../components/TransactionsTable';
import { EChart, axes } from '../../charts/EChart';
import { byMonth, byPerson, byTask, pendingChanges, totals } from '../../lib/billability';
import { projectHealth } from '../../lib/health';
import { formatDate, formatMonth, nowIso } from '../../lib/dates';
import { hours, money, num, pct, shortName } from '../../lib/format';
import { BILLING_STEPS, stepsDone } from '../../lib/billing';

export function ProjectPage() {
  const { id } = useParams();
  const project = useProject(id);
  if (project === undefined)
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  if (project === null) return <EmptyState title="Project not found">It may have been removed, or the link is from an older import.</EmptyState>;
  return <ProjectView project={project} />;
}

function ProjectView({ project: p }: { project: Project }) {
  const txns = useTransactions(p.id);
  const overrides = useOverrides(p.id);
  const settings = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = `/projects/${encodeURIComponent(p.id)}`;
  const tab = pathname.slice(base.length + 1).split('/')[0] || 'overview';
  const health = useMemo(() => projectHealth(p, txns, overrides, settings), [p, txns, overrides, settings]);
  const pending = useMemo(() => pendingChanges(txns, overrides), [txns, overrides]);

  return (
    <Stack gap="md">
      <PageHeader
        title={shortName(p.name)}
        description={
          <>
            {p.id}
            {p.customer ? ` · ${p.customer}` : ''}
            {p.manager ? ` · PM ${p.manager}` : ''}
            {p.billPlanMethod ? ` · ${p.billPlanMethod}` : ''}
            {billingMode(p) === 'task' ? ' · billed per task' : ''}
            {p.fin ? ` · money as at ${formatDate(p.fin.asOf)}` : ''}
          </>
        }
        badge={<HealthBadge level={health.level} size="md" />}
        actions={<Switch label="Mine" checked={p.mine} onChange={(e) => db.projects.update(p.id, { mine: e.currentTarget.checked, updatedAt: nowIso() })} />}
      />
      <Tabs value={tab} onChange={(v) => navigate(v === 'overview' ? base : `${base}/${v}`)}>
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="transactions" rightSection={pending.length ? <Badge size="xs" color="orange" variant="filled">{pending.length}</Badge> : undefined}>
            Transactions
          </Tabs.Tab>
          <Tabs.Tab value="people">People</Tabs.Tab>
          <Tabs.Tab value="tasks">Tasks</Tabs.Tab>
          <Tabs.Tab value="billing">Billing</Tabs.Tab>
          {settings.features.labInvoices && <Tabs.Tab value="lab">Lab invoices</Tabs.Tab>}
          <Tabs.Tab value="details">Details</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Routes>
        <Route index element={<Overview p={p} txns={txns} overrides={overrides} health={health} />} />
        <Route path="transactions" element={<TransactionsTable txns={txns} overrides={overrides} />} />
        <Route path="people" element={<People txns={txns} overrides={overrides} />} />
        <Route path="tasks" element={<TasksTab p={p} txns={txns} overrides={overrides} />} />
        <Route path="billing" element={<BillingTab p={p} />} />
        <Route path="lab" element={<LabTab p={p} />} />
        <Route path="details" element={<Details p={p} />} />
      </Routes>
    </Stack>
  );
}

type Props = { txns: ReturnType<typeof useTransactions>; overrides: ReturnType<typeof useOverrides> };

function Overview({ p, txns, overrides, health }: Props & { p: Project; health: ReturnType<typeof projectHealth> }) {
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';
  const months = useMemo(() => byMonth(txns, overrides), [txns, overrides]);
  const t = health.totals;
  const fin = p.fin;
  const chart = useMemo(() => {
    const ax = axes(dark);
    return {
      legend: { top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      xAxis: { type: 'category', data: months.map((m) => formatMonth(m.key)), ...ax.xAxis },
      yAxis: { type: 'value', ...ax.yAxis, axisLabel: { ...ax.yAxis.axisLabel, formatter: (v: number) => `$${v / 1000}k` } },
      series: [
        { name: 'Cost', type: 'bar', data: months.map((m) => Math.round(m.totals.cost)), itemStyle: { borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
        { name: 'Billable amount', type: 'bar', data: months.map((m) => Math.round(m.totals.billableEffort)), itemStyle: { borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 },
      ],
    };
  }, [months, dark]);
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatTile label="Cost budget" value={money(fin?.budgetCost)} sub={fin ? `${pct(health.spent)} spent · ${money(fin.actualCost)} actual` : 'Import the Power BI export for budgets'} />
        <StatTile label="Revenue to date" value={money(fin?.itdRevenue)} sub={fin ? `of ${money(fin.budgetRevenue)} budget · ${pct(fin.revenuePct)}` : undefined} />
        <StatTile label="Net margin" value={pct(fin?.actualNM)} sub={fin?.budgetNM !== undefined ? `budgeted ${pct(fin.budgetNM)}` : undefined} color={fin?.actualNM !== undefined && fin.actualNM < 0 ? 'red' : undefined} />
        <StatTile label="Budget left (effort)" value={money(fin?.remainingBudget)} sub={fin ? `WIP ${money(fin.totalWIP)} · AR ${money(fin.totalAR)} · invoiced ${money(fin.itdInvoiced)}` : undefined} color={fin?.remainingBudget !== undefined && fin.remainingBudget < 0 ? 'red' : undefined} />
      </SimpleGrid>
      {health.spent !== undefined && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" fw={600}>
              Cost spent against budget
            </Text>
            <Text size="sm" className="tabular">
              {money(fin?.actualCost)} of {money(fin?.budgetCost)} ({pct(health.spent)})
            </Text>
          </Group>
          <Progress value={Math.min(100, health.spent * 100)} size="lg" color={health.spent >= 1 ? 'red' : health.spent >= 0.95 ? 'orange' : health.spent >= 0.8 ? 'yellow' : 'teal'} />
          {health.reasons.length > 0 && (
            <Text size="xs" c="dimmed" mt={6}>
              {health.reasons.join(' · ')}
            </Text>
          )}
        </Paper>
      )}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatTile label="Hours (Effort Report)" value={num(t.hours, 1)} sub={`${num(t.billableHours, 1)} billable · ${num(t.nonBillableHours, 1)} non-billable (${pct(t.nonBillablePct)})`} />
        <StatTile label="Cost (Effort Report)" value={money(t.cost)} sub={`${money(t.expenses)} of it expenses, lab and km`} />
        <StatTile label="Billable amount" value={money(t.billableEffort)} sub={`margin ${money(t.margin)} · ${money(t.effectiveRate)}/h effective`} />
        <StatTile label="Not yet invoiced" value={money(t.unbilledEffort)} sub={`${num(t.unbilledHours, 1)} hours waiting to be billed`} color={t.unbilledEffort > 0 ? 'orange' : undefined} />
      </SimpleGrid>
      <Card>
        <Text fw={600} mb="xs">
          Cost and billable amount by month
        </Text>
        {months.length ? <EChart option={chart} height={260} /> : <Text size="sm" c="dimmed">No transactions yet – import an Effort Report.</Text>}
      </Card>
    </Stack>
  );
}

function People({ txns, overrides }: Props) {
  const people = useMemo(() => byPerson(txns, overrides), [txns, overrides]);
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <ScrollArea type="auto">
        <table className="pm-grid">
          <thead>
            <tr>
              <th>Person / resource</th>
              <th className="num">Hours</th>
              <th className="num">Billable h</th>
              <th className="num">Non-billable h</th>
              <th className="num">NB %</th>
              <th className="num">Cost</th>
              <th className="num">Billable amount</th>
              <th className="num">Effective rate</th>
              <th className="num">Margin</th>
              <th className="num">Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {people.map((g) => (
              <tr key={g.key}>
                <td>{g.label}</td>
                <td className="num">{num(g.totals.hours, 2)}</td>
                <td className="num">{num(g.totals.billableHours, 2)}</td>
                <td className="num">{num(g.totals.nonBillableHours, 2)}</td>
                <td className="num">{pct(g.totals.nonBillablePct)}</td>
                <td className="num">{money(g.totals.cost, true)}</td>
                <td className="num">{money(g.totals.billableEffort, true)}</td>
                <td className="num">{g.totals.billableHours ? money(g.totals.effectiveRate) : '–'}</td>
                <td className="num" style={{ color: g.totals.margin < 0 ? 'var(--mantine-color-red-7)' : undefined }}>
                  {money(g.totals.margin, true)}
                </td>
                <td className="num">{money(g.totals.unbilledEffort, true)}</td>
              </tr>
            ))}
            <TotalsRow label="Total" txns={txns} overrides={overrides} />
          </tbody>
        </table>
      </ScrollArea>
    </Paper>
  );
}

function TotalsRow({ label, txns, overrides }: Props & { label: string }) {
  const t = totals(txns, overrides);
  return (
    <tr style={{ fontWeight: 600 }}>
      <td>{label}</td>
      <td className="num">{num(t.hours, 2)}</td>
      <td className="num">{num(t.billableHours, 2)}</td>
      <td className="num">{num(t.nonBillableHours, 2)}</td>
      <td className="num">{pct(t.nonBillablePct)}</td>
      <td className="num">{money(t.cost, true)}</td>
      <td className="num">{money(t.billableEffort, true)}</td>
      <td className="num">{t.billableHours ? money(t.effectiveRate) : '–'}</td>
      <td className="num">{money(t.margin, true)}</td>
      <td className="num">{money(t.unbilledEffort, true)}</td>
    </tr>
  );
}

function TasksTab({ p, txns, overrides }: Props & { p: Project }) {
  const tasks = useMemo(() => byTask(txns, overrides), [txns, overrides]);
  const cycles = useCycles();
  const perTask = billingMode(p) === 'task';
  // claimed to date: as at the month after the latest billing month (so this month's entries count)
  const claimed = useMemo(() => previousProgress(p.id, addM(currentBillingMonth(), 2), cycles), [p.id, cycles]);
  const fees = new Map((p.taskFees ?? []).map((f) => [f.taskNumber, f.fee]));
  if (perTask)
    return (
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Billed per task: each task’s quoted fee against the time and costs booked to it. Fees are set in Details; % complete is claimed each month on Monthly billing.
        </Text>
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <ScrollArea type="auto">
            <table className="pm-grid">
              <thead>
                <tr>
                  <th>Task</th>
                  <th className="num">Quoted fee</th>
                  <th className="num">Claimed</th>
                  <th className="num">Claimed to date</th>
                  <th className="num">Hours</th>
                  <th className="num">Cost</th>
                  <th className="num">Cost vs fee</th>
                  <th className="num">Fee left</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set([...fees.keys(), ...tasks.map((g) => g.key)])].map((n) => {
                  const g = tasks.find((t) => t.key === n);
                  const fee = fees.get(n) ?? 0;
                  const pc = claimed[n] ?? 0;
                  const over = fee > 0 && (g?.totals.cost ?? 0) > fee;
                  return (
                    <tr key={n}>
                      <td>{g?.label ?? `${(p.taskFees ?? []).find((f) => f.taskNumber === n)?.taskName ?? n} (${n})`}</td>
                      <td className="num">{fee ? money(fee) : '–'}</td>
                      <td className="num">{pct(pc, false)}</td>
                      <td className="num">{money((fee * pc) / 100)}</td>
                      <td className="num">{num(g?.totals.hours ?? 0, 2)}</td>
                      <td className="num">{money(g?.totals.cost ?? 0, true)}</td>
                      <td className="num" style={{ color: over ? 'var(--mantine-color-red-7)' : undefined }}>
                        {fee ? pct((g?.totals.cost ?? 0) / fee) : '–'}
                      </td>
                      <td className="num">{fee ? money(fee - (fee * pc) / 100) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </Paper>
      </Stack>
    );
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <ScrollArea type="auto">
        <table className="pm-grid">
          <thead>
            <tr>
              <th>Task</th>
              <th className="num">Hours</th>
              <th className="num">Billable h</th>
              <th className="num">Non-billable h</th>
              <th className="num">NB %</th>
              <th className="num">Cost</th>
              <th className="num">Billable amount</th>
              <th className="num">Effective rate</th>
              <th className="num">Margin</th>
              <th className="num">Unbilled</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((g) => (
              <tr key={g.key}>
                <td>{g.label}</td>
                <td className="num">{num(g.totals.hours, 2)}</td>
                <td className="num">{num(g.totals.billableHours, 2)}</td>
                <td className="num">{num(g.totals.nonBillableHours, 2)}</td>
                <td className="num">{pct(g.totals.nonBillablePct)}</td>
                <td className="num">{money(g.totals.cost, true)}</td>
                <td className="num">{money(g.totals.billableEffort, true)}</td>
                <td className="num">{g.totals.billableHours ? money(g.totals.effectiveRate) : '–'}</td>
                <td className="num" style={{ color: g.totals.margin < 0 ? 'var(--mantine-color-red-7)' : undefined }}>
                  {money(g.totals.margin, true)}
                </td>
                <td className="num">{money(g.totals.unbilledEffort, true)}</td>
              </tr>
            ))}
            <TotalsRow label="Total" txns={txns} overrides={overrides} />
          </tbody>
        </table>
      </ScrollArea>
    </Paper>
  );
}

function BillingTab({ p }: { p: Project }) {
  const cycles = useCycles().filter((c) => c.projectId === p.id).sort((a, b) => b.month.localeCompare(a.month));
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Each month’s billing for this project. Work through the steps on <Anchor component={Link} to="/billing">Monthly billing</Anchor>.
      </Text>
      {!cycles.length && <EmptyState title="No billing recorded yet">Open Monthly billing and tick the steps as you go; they show here as this project’s history.</EmptyState>}
      {cycles.map((c) => (
        <Paper key={c.id} withBorder p="sm" radius="md" component={Link} to={`/billing/${c.month}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text fw={600} size="sm">
                {formatMonth(c.month, true)}
              </Text>
              <Text size="xs" c="dimmed">
                {c.skipped ? 'Nothing to bill' : BILLING_STEPS.filter((s) => c.steps[s.key]).map((s) => `${s.label} ${formatDate(c.steps[s.key]!.slice(0, 10))}`).join(' · ') || 'Not started'}
                {c.invoiceAmount ? ` · invoiced ${money(c.invoiceAmount)}` : ''}
                {c.invoiceNumber ? ` (${c.invoiceNumber})` : ''}
              </Text>
              {c.notes && (
                <Text size="xs" c="dimmed">
                  {c.notes}
                </Text>
              )}
            </div>
            <Progress value={(stepsDone(c) / BILLING_STEPS.length) * 100} w={100} color={c.skipped || c.steps.invoiced ? 'teal' : 'indigo'} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

function LabTab({ p }: { p: Project }) {
  const list = useLabInvoices()
    .filter((i) => i.projectId === p.id)
    .sort((a, b) => (b.invoiceDate ?? b.roundDate ?? '').localeCompare(a.invoiceDate ?? a.roundDate ?? ''));
  if (!list.length) return <EmptyState title="No lab invoices for this project">Log them on the Lab invoices page; the ones whose job code matches this project show here.</EmptyState>;
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <ScrollArea type="auto">
        <table className="pm-grid">
          <thead>
            <tr>
              <th>Round</th>
              <th>Type</th>
              <th>Lab</th>
              <th>Invoice</th>
              <th>Invoice date</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th>Sent to AP</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{formatDate(i.roundDate)}</td>
                <td>{i.roundType}</td>
                <td>{i.lab}</td>
                <td>{i.invoiceNo}</td>
                <td>{formatDate(i.invoiceDate)}</td>
                <td className="num">{money(i.amount, true)}</td>
                <td>
                  <LabStatusBadge status={i.status} />
                </td>
                <td>{formatDate(i.sentToAp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </Paper>
  );
}

function Details({ p }: { p: Project }) {
  const navigate = useNavigate();
  const save = (patch: Partial<Project>) => db.projects.update(p.id, { ...patch, updatedAt: nowIso() });
  const field = (label: string, key: keyof Project, placeholder?: string) => <TextInput label={label} placeholder={placeholder} defaultValue={(p[key] as string) ?? ''} onBlur={(e) => e.currentTarget.value !== ((p[key] as string) ?? '') && save({ [key]: e.currentTarget.value || undefined } as Partial<Project>)} />;
  const remove = () =>
    modals.openConfirmModal({
      title: 'Delete this project?',
      children: <Text size="sm">Its transactions and billing records go too. It will come back (without your details) if it is in the next Effort Report you import.</Text>,
      labels: { confirm: 'Delete', cancel: 'Keep' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await db.transaction('rw', [db.projects, db.transactions, db.overrides, db.billing], async () => {
          await db.transactions.where('projectId').equals(p.id).delete();
          await db.overrides.where('projectId').equals(p.id).delete();
          await db.billing.where('projectId').equals(p.id).delete();
          await db.projects.delete(p.id);
        });
        navigate('/projects');
      },
    });
  return (
    <Stack gap="md" maw={760}>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {field('Name', 'name')}
        {field('Client', 'customer')}
        <Select label="Status" value={p.status} onChange={(v) => v && save({ status: v as Project['status'] })} data={[{ value: 'active', label: 'Active' }, { value: 'on-hold', label: 'On hold' }, { value: 'closed', label: 'Closed' }]} />
        {field('Project manager', 'manager')}
        {field('Job code (as the monitoring sheet writes it)', 'jobCode', 'e.g. 2-34646.00')}
        {field('Purchase order (for lab invoices)', 'po', 'e.g. P100966NZ001')}
        {field('Client reference / client PO (on our invoices)', 'clientReference')}
        {field('Client contact', 'clientContact')}
        {field('Client e-mail', 'clientEmail')}
        {field('Consents', 'consents')}
        {field('Folder', 'folder', 'A path to the project folder')}
      </SimpleGrid>
      <Card padding="md">
        <Title order={6} mb={4}>
          How it is billed
        </Title>
        <Select
          label="Billing"
          description="Time & costs: people’s hours and expenses line by line. Per task: a % of each task’s quoted fee each month, not individual time."
          value={billingMode(p)}
          onChange={(v) => v && save({ billingMode: v as BillingMode })}
          data={[
            { value: 'time', label: 'Time & costs (hours and expenses)' },
            { value: 'task', label: 'Per task (% of the quoted fee)' },
          ]}
          maw={420}
        />
        {billingMode(p) === 'task' && <TaskFees p={p} />}
      </Card>
      <TextInput label="Also known as (other codes, comma-separated)" defaultValue={p.aliases.join(', ')} onBlur={(e) => save({ aliases: e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean) })} description="Codes that mean this project in the monitoring sheet and lab tracker, e.g. 2-34646.00" />
      <Textarea label="Notes" autosize minRows={3} defaultValue={p.notes ?? ''} onBlur={(e) => e.currentTarget.value !== (p.notes ?? '') && save({ notes: e.currentTarget.value || undefined })} />
      {p.fin && (
        <Card padding="md">
          <Title order={6} mb={4}>
            Power BI money (as at {formatDate(p.fin.asOf)})
          </Title>
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing={4}>
            {(
              [
                ['Fee type', p.fin.feeType],
                ['Budget revenue', money(p.fin.budgetRevenue)],
                ['Revenue to date', money(p.fin.itdRevenue)],
                ['Budget cost', money(p.fin.budgetCost)],
                ['Actual cost', money(p.fin.actualCost)],
                ['Budget NM', pct(p.fin.budgetNM)],
                ['Actual NM', pct(p.fin.actualNM)],
                ['Budget DLM', num(p.fin.budgetDLM)],
                ['Actual DLM', num(p.fin.actualDLM)],
                ['Total AR', money(p.fin.totalAR)],
                ['Total WIP', money(p.fin.totalWIP)],
                ['Invoiced to date', money(p.fin.itdInvoiced)],
                ['Effort to date', money(p.fin.itdEffort)],
                ['Remaining (effort)', money(p.fin.remainingBudget)],
                ['Hours (effort report)', hours(0)],
              ] as Array<[string, string | undefined]>
            )
              .slice(0, 14)
              .map(([k, v]) => (
                <Text key={k} size="xs">
                  <Text span c="dimmed">
                    {k}:
                  </Text>{' '}
                  {v ?? '–'}
                </Text>
              ))}
          </SimpleGrid>
        </Card>
      )}
      <Group>
        <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={remove}>
          Delete project
        </Button>
      </Group>
    </Stack>
  );
}

/** The quoted fee for each task of a per-task project. */
function TaskFees({ p }: { p: Project }) {
  const txns = useTransactions(p.id);
  const fees = p.taskFees ?? [];
  const known = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of txns) if (!m.has(t.taskNumber)) m.set(t.taskNumber, t.taskName);
    return m;
  }, [txns]);
  const rows: TaskFee[] = [...fees, ...[...known.entries()].filter(([n]) => !fees.some((f) => f.taskNumber === n)).map(([taskNumber, taskName]) => ({ taskNumber, taskName, fee: 0 }))];
  const saveFees = (next: TaskFee[]) => db.projects.update(p.id, { taskFees: next.filter((f) => f.taskNumber.trim()), updatedAt: nowIso() });
  const setFee = (taskNumber: string, taskName: string, fee: number) => {
    const next = rows.map((r) => (r.taskNumber === taskNumber ? { ...r, taskName, fee } : r));
    if (!next.some((r) => r.taskNumber === taskNumber)) next.push({ taskNumber, taskName, fee });
    return saveFees(next);
  };
  const total = rows.reduce((a, r) => a + (r.fee || 0), 0);
  return (
    <Stack gap="xs" mt="sm">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Quoted fee per task
        </Text>
        <Text size="sm" className="tabular">
          Total quoted <b>{money(total)}</b>
          {p.fin?.budgetRevenue ? ` · budget revenue ${money(p.fin.budgetRevenue)}` : ''}
        </Text>
      </Group>
      <Text size="xs" c="dimmed">
        Tasks with time booked to them are listed already; add any others. The fee is what the client is quoted for that task (excl GST).
      </Text>
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <table className="pm-grid">
          <thead>
            <tr>
              <th>Task #</th>
              <th>Task</th>
              <th className="num">Quoted fee</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.taskNumber}>
                <td>{r.taskNumber}</td>
                <td>
                  <TextInput size="xs" defaultValue={r.taskName} onBlur={(e) => e.currentTarget.value !== r.taskName && setFee(r.taskNumber, e.currentTarget.value, r.fee)} />
                </td>
                <td className="num">
                  <NumberInput size="xs" value={r.fee || ''} prefix="$" thousandSeparator min={0} onChange={(v) => setFee(r.taskNumber, r.taskName, typeof v === 'number' ? v : 0)} w={140} style={{ marginLeft: 'auto' }} />
                </td>
                <td>
                  {!known.has(r.taskNumber) && (
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => saveFees(rows.filter((x) => x.taskNumber !== r.taskNumber))} aria-label="Remove">
                      <IconTrash size={13} />
                    </ActionIcon>
                  )}
                </td>
              </tr>
            ))}
            <NewTaskRow onAdd={(n, name, fee) => setFee(n, name, fee)} existing={rows.map((r) => r.taskNumber)} />
          </tbody>
        </table>
      </Paper>
    </Stack>
  );
}

function NewTaskRow({ onAdd, existing }: { onAdd: (taskNumber: string, taskName: string, fee: number) => void; existing: string[] }) {
  const [n, setN] = useState('');
  const [name, setName] = useState('');
  const [fee, setFee] = useState<number | ''>('');
  const ok = n.trim() && !existing.includes(n.trim());
  const add = () => {
    if (!ok) return;
    onAdd(n.trim(), name.trim() || n.trim(), typeof fee === 'number' ? fee : 0);
    setN('');
    setName('');
    setFee('');
  };
  return (
    <tr>
      <td>
        <TextInput size="xs" placeholder="e.g. 003" value={n} onChange={(e) => setN(e.currentTarget.value)} w={90} />
      </td>
      <td>
        <TextInput size="xs" placeholder="Task name" value={name} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </td>
      <td className="num">
        <NumberInput size="xs" value={fee} prefix="$" thousandSeparator min={0} onChange={(v) => setFee(typeof v === 'number' ? v : '')} w={140} style={{ marginLeft: 'auto' }} />
      </td>
      <td>
        <ActionIcon size="sm" variant="light" onClick={add} disabled={!ok} aria-label="Add task">
          <IconPlus size={13} />
        </ActionIcon>
      </td>
    </tr>
  );
}
