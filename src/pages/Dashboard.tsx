import { useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Center, Checkbox, Group, Loader, Paper, Progress, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title, Tooltip } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Link } from 'react-router-dom';
import { IconArrowRight, IconCalendarMonth, IconFileInvoice, IconPlus, IconReceipt2, IconSparkles, IconTrash, IconUpload } from '@tabler/icons-react';
import { db } from '../db/db';
import { projectPath, useEverything } from '../hooks/useData';
import { PageHeader, StatTile, HealthBadge } from '../components/common';
import { AlertsList } from '../components/AlertsList';
import { billingDueDate, currentBillingMonth, monthBilling } from '../lib/billing';
import { formatDate, formatMonth, nowIso, toDateStr } from '../lib/dates';
import { money, plural, shortName, uid } from '../lib/format';
import { billingMode } from '../lib/tasks';
import { IconAlertTriangle, IconChecklist } from '@tabler/icons-react';
import { projectHealth, HEALTH_META } from '../lib/health';
import { scheduledItems } from '../lib/schedule';
import { MONTHS_LONG } from '../lib/dates';

function Welcome() {
  return (
    <Stack gap="lg">
      <Paper withBorder p="xl" radius="lg">
        <Stack gap="md">
          <Group gap="sm">
            <ThemeIcon size={44} radius="md" variant="light">
              <IconSparkles size={26} />
            </ThemeIcon>
            <div>
              <Title order={3}>Welcome to PM Toolbox</Title>
              <Text c="dimmed">Your projects’ time, costs and billing in one place – in your browser, nothing leaves your computer.</Text>
            </div>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            {[
              ['1. Import', 'Drop in the Effort Report export (or the whole Project Health Tracker workbook), the Power BI export, and the monitoring spreadsheet. Everything is recognised by its sheet.'],
              ['2. Review', 'See each project’s hours, costs and margin, who did what, and turn billability on or off line by line. Your choices are remembered when you import a fresh export.'],
              ['3. Bill and watch', 'Each month, work through the billing checklist per project, log lab invoices through to AP, and let the dashboard tell you what’s due.'],
            ].map(([t, d]) => (
              <Card key={t} padding="md">
                <Text fw={600}>{t}</Text>
                <Text size="sm" c="dimmed">
                  {d}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
          <Group>
            <Button component={Link} to="/import" leftSection={<IconUpload size={16} />}>
              Import your files
            </Button>
            <Button component={Link} to="/settings" variant="default">
              Set your name first
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Tip: put your name (as the exports write it, e.g. “Foote, Benjamin”) in Settings so the projects you manage are picked out automatically.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Todos({ todos, projects }: { todos: ReturnType<typeof useEverything>['todos']; projects: ReturnType<typeof useEverything>['projects'] }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<Date | null>(null);
  const open = todos.filter((t) => !t.done).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const add = async () => {
    if (!title.trim()) return;
    await db.todos.put({ id: uid(), title: title.trim(), due: due ? toDateStr(due) : undefined, createdAt: nowIso() });
    setTitle('');
    setDue(null);
  };
  return (
    <Card>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>My to-do list</Text>
        <Text size="xs" c="dimmed">
          {plural(open.length, 'open item')}
        </Text>
      </Group>
      <Group gap="xs" mb="sm" wrap="nowrap">
        <TextInput placeholder="Something to do…" value={title} onChange={(e) => setTitle(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && add()} size="sm" style={{ flex: 1 }} />
        <DateInput placeholder="Due" value={due} onChange={setDue} size="sm" w={130} clearable valueFormat="D MMM" />
        <ActionIcon onClick={add} variant="filled" size="lg" aria-label="Add">
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
      <Stack gap={4}>
        {open.map((t) => (
          <Group key={t.id} gap="xs" wrap="nowrap" justify="space-between">
            <Checkbox size="sm" label={t.title} checked={false} onChange={() => db.todos.update(t.id, { done: nowIso() })} />
            <Group gap={6} wrap="nowrap">
              {t.projectId && (
                <Text size="xs" c="dimmed">
                  {projects.find((p) => p.id === t.projectId)?.name.slice(0, 30)}
                </Text>
              )}
              {t.due && (
                <Badge size="xs" color={t.due < toDateStr(new Date()) ? 'red' : 'gray'} variant="light">
                  {formatDate(t.due)}
                </Badge>
              )}
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => db.todos.delete(t.id)} aria-label="Delete">
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
          </Group>
        ))}
        {!open.length && (
          <Text size="sm" c="dimmed">
            Nothing on the list.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function DashboardPage() {
  const all = useEverything();
  const { projects, txns, overrides, cycles, labInvoices, rows, marks, alerts, settings, today, loading, todos } = all;
  const mine = useMemo(() => projects.filter((p) => p.mine && p.status === 'active'), [projects]);
  const month = currentBillingMonth(today);
  const billing = useMemo(() => monthBilling(month, projects, txns, overrides, cycles), [month, projects, txns, overrides, cycles]);
  const byProject = useMemo(() => {
    const m = new Map<string, typeof txns>();
    for (const t of txns) {
      if (!m.has(t.projectId)) m.set(t.projectId, []);
      m.get(t.projectId)!.push(t);
    }
    return m;
  }, [txns]);
  const health = useMemo(() => mine.map((p) => ({ p, h: projectHealth(p, byProject.get(p.id) ?? [], overrides, settings) })).sort((a, b) => HEALTH_META[a.h.level].order - HEALTH_META[b.h.level].order || b.h.totals.unbilledEffort - a.h.totals.unbilledEffort), [mine, byProject, overrides, settings]);
  const [y, m] = today.split('-').map(Number);
  const thisMonth = useMemo(() => scheduledItems(rows, marks, y).filter((i) => i.month === m), [rows, marks, y, m]);

  if (loading)
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  if (!projects.length && !rows.length && !labInvoices.length) return <Welcome />;

  const unbilled = health.filter((x) => billingMode(x.p) === 'time').reduce((a, x) => a + x.h.totals.unbilledEffort, 0);
  const billingDone = billing.filter((b) => b.done).length;
  const labWaiting = labInvoices.filter((i) => i.status === 'received' || i.status === 'query').length;
  const urgent = alerts.filter((a) => a.severity !== 'info').length;

  return (
    <Stack gap="lg">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}`} description={`${formatDate(today)} · ${plural(mine.length, 'project')} you manage · ${urgent ? `${plural(urgent, 'thing')} need attention` : 'nothing pressing'}`} />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatTile label={`${formatMonth(month)} billing`} value={`${billingDone} / ${billing.length}`} sub={`projects done · due ${formatDate(billingDueDate(month, settings))}`} color={billingDone === billing.length ? 'teal' : undefined} icon={<IconReceipt2 size={22} color="var(--pm-muted)" />} onClick={() => (location.hash = `#/billing/${month}`)} />
        <StatTile label="Billable, not yet invoiced" value={money(unbilled)} sub="on your time & materials projects (as it stands here)" icon={<IconReceipt2 size={22} color="var(--pm-muted)" />} />
        {settings.features.labInvoices ? (
          <StatTile label="Lab invoices waiting" value={labWaiting} sub="received, not yet sent to AP (or queried)" color={labWaiting ? 'orange' : 'teal'} icon={<IconFileInvoice size={22} color="var(--pm-muted)" />} onClick={() => (location.hash = '#/lab-invoices')} />
        ) : (
          <StatTile label="Projects to watch" value={health.filter((x) => x.h.level === 'critical' || x.h.level === 'serious' || x.h.level === 'warning').length} sub={`of ${mine.length} over budget, at risk or to watch`} color={health.some((x) => x.h.level === 'critical') ? 'red' : undefined} icon={<IconAlertTriangle size={22} color="var(--pm-muted)" />} onClick={() => (location.hash = '#/projects')} />
        )}
        {settings.features.calendar ? (
          <StatTile label={`Monitoring in ${MONTHS_LONG[m - 1]}`} value={`${thisMonth.filter((i) => i.status === 'done').length} / ${thisMonth.length}`} sub="rounds done this month" icon={<IconCalendarMonth size={22} color="var(--pm-muted)" />} onClick={() => (location.hash = `#/calendar/${y}`)} />
        ) : (
          <StatTile label="To-dos open" value={todos.filter((t) => !t.done).length} sub={todos.some((t) => !t.done && t.due && t.due < today) ? 'some are overdue' : 'nothing overdue'} icon={<IconChecklist size={22} color="var(--pm-muted)" />} />
        )}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Needs attention</Text>
            <Text size="xs" c="dimmed">
              {plural(alerts.length, 'alert')}
            </Text>
          </Group>
          <AlertsList alerts={alerts} limit={12} />
        </Card>
        <Stack gap="lg">
          <Card>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{formatMonth(month, true)} billing</Text>
              <Button component={Link} to={`/billing/${month}`} size="xs" variant="subtle" rightSection={<IconArrowRight size={14} />}>
                Open
              </Button>
            </Group>
            <Stack gap={6}>
              {billing.map((b) => (
                <Group key={b.project.id} gap="sm" wrap="nowrap">
                  <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate component={Link} to={projectPath(b.project.id)} c="inherit" td="none">
                    {shortName(b.project.name)}
                  </Text>
                  <Text size="xs" c="dimmed" className="tabular" w={90} ta="right" title={b.mode === 'task' ? 'This month’s claim (% complete per task)' : 'Billable, not yet invoiced'}>
                    {money(b.toInvoice)}
                  </Text>
                  <Tooltip label={b.done ? 'Done' : `${Math.round(b.progress * 4)} of 4 steps`}>
                    <Progress value={b.progress * 100} color={b.done ? 'teal' : 'indigo'} w={80} size="sm" />
                  </Tooltip>
                </Group>
              ))}
              {!billing.length && (
                <Text size="sm" c="dimmed">
                  No projects of yours to bill. Import an Effort Report, or tick “mine” on a project.
                </Text>
              )}
            </Stack>
          </Card>
          <Todos todos={todos} projects={projects} />
        </Stack>
      </SimpleGrid>

      <div>
        <Group justify="space-between" mb="xs">
          <Title order={4}>My projects</Title>
          <Button component={Link} to="/projects" size="xs" variant="subtle" rightSection={<IconArrowRight size={14} />}>
            All projects
          </Button>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {health.map(({ p, h }) => (
            <Card key={p.id} component={Link} to={projectPath(p.id)} style={{ textDecoration: 'none', color: 'inherit' }} padding="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap" mb={6}>
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} size="sm" lineClamp={2}>
                    {shortName(p.name)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {p.id} · {p.customer ?? ''}
                  </Text>
                </div>
                <HealthBadge level={h.level} />
              </Group>
              {h.spent !== undefined && (
                <Stack gap={2} mb={6}>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      Cost spent
                    </Text>
                    <Text size="xs" className="tabular">
                      {Math.round(h.spent * 100)}% of {money(p.fin?.budgetCost)}
                    </Text>
                  </Group>
                  <Progress value={Math.min(100, h.spent * 100)} color={h.spent >= 1 ? 'red' : h.spent >= settings.budgetDangerPct / 100 ? 'orange' : h.spent >= settings.budgetWarnPct / 100 ? 'yellow' : 'teal'} size="sm" />
                </Stack>
              )}
              <Group gap="md">
                <Text size="xs" c="dimmed">
                  Margin <b>{h.margin !== undefined ? `${Math.round(h.margin * 100)}%` : '–'}</b>
                </Text>
                <Text size="xs" c="dimmed">
                  {billingMode(p) === 'task' ? <>Billed per task</> : <>Unbilled <b>{money(h.totals.unbilledEffort)}</b></>}
                </Text>
                <Text size="xs" c="dimmed">
                  Hours <b>{Math.round(h.totals.hours)}</b>
                </Text>
              </Group>
            </Card>
          ))}
          {!health.length && (
            <Text size="sm" c="dimmed">
              No projects marked as yours yet.
            </Text>
          )}
        </SimpleGrid>
      </div>
    </Stack>
  );
}
