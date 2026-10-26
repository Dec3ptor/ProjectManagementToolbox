import { useState } from 'react';
import { Alert, Badge, Button, Card, Group, List, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { IconCheck, IconFileSpreadsheet, IconUpload, IconX } from '@tabler/icons-react';
import { getSettings } from '../db/db';
import { PageHeader } from '../components/common';
import { useImports, useSettings } from '../hooks/useData';
import { analyseWorkbook, planKinds, type ImportPlan } from '../importers/analyse';
import { applyPlan } from '../importers/apply';
import { readWorkbook } from '../importers/xlsx';
import { formatDate } from '../lib/dates';

const KIND_LABEL: Record<string, string> = {
  effort: 'Effort Report (transactions)',
  powerBi: 'Power BI export (project money)',
  schedule: 'Monitoring schedule',
  labInvoices: 'Lab invoice tracker',
  lists: 'Tracker lists (job codes and POs)',
  contacts: 'Client details',
  overrides: 'Billability overrides',
};

function describe(p: ImportPlan): string[] {
  const out: string[] = [];
  if (p.effort) out.push(`${p.effort.transactions.length} transactions across ${p.effort.projects.length} projects (sheet “${p.effort.sheet}”)`);
  if (p.powerBi) out.push(`Money for ${p.powerBi.rows.length} projects (sheet “${p.powerBi.sheet}”)`);
  if (p.schedule) out.push(`${p.schedule.rows.length} schedule rows (sheet “${p.schedule.sheet}”)`);
  if (p.labInvoices) out.push(`${p.labInvoices.invoices.length} lab invoices (sheet “${p.labInvoices.sheet}”)`);
  if (p.lists) out.push(`${p.lists.rows.length} job code / PO rows (sheet “${p.lists.sheet}”)`);
  if (p.contacts) out.push(`${p.contacts.rows.length} client contact rows (sheet “${p.contacts.sheet}”)`);
  if (p.overrides) out.push(`${p.overrides.rows.length} saved billability choices (sheet “${p.overrides.sheet}”)`);
  return out;
}

export function ImportPage() {
  const settings = useSettings();
  const imports = useImports();
  const [plans, setPlans] = useState<ImportPlan[]>([]);
  const [busy, setBusy] = useState(false);

  const onDrop = async (files: File[]) => {
    setBusy(true);
    const next: ImportPlan[] = [];
    for (const f of files) {
      try {
        const sheets = readWorkbook(await f.arrayBuffer());
        next.push(analyseWorkbook(f.name, sheets));
      } catch (e) {
        notifications.show({ title: `Couldn’t read ${f.name}`, message: (e as Error).message, color: 'red' });
      }
    }
    setPlans((p) => [...p, ...next]);
    setBusy(false);
  };

  const importAll = async () => {
    setBusy(true);
    const s = await getSettings();
    let n = 0;
    for (const p of plans) {
      if (!planKinds(p).length) continue;
      const r = await applyPlan(p, s);
      n += Object.values(r.counts).reduce((a, b) => a + b, 0);
    }
    setPlans([]);
    setBusy(false);
    notifications.show({ title: 'Imported', message: `${n} records written. Your billability choices were kept.`, color: 'teal' });
  };

  return (
    <Stack gap="md">
      <PageHeader title="Import data" description="Drop your exports here. Each sheet is recognised by its headings, so the whole Project Health Tracker workbook or the monitoring spreadsheet can go in as it is." />
      {!settings.myName && (
        <Alert color="yellow" title="Set your name first">
          Projects are marked as yours when their manager matches your name in <Link to="/settings">Settings</Link>. Without it you can still tick “mine” on each project by hand.
        </Alert>
      )}
      <Dropzone onDrop={onDrop} loading={busy} accept={['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', '.xlsx', '.xls', '.csv', '.xlsm']} multiple>
        <Group justify="center" gap="xl" mih={140} style={{ pointerEvents: 'none' }}>
          <Dropzone.Accept>
            <IconUpload size={44} stroke={1.5} />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX size={44} stroke={1.5} />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconFileSpreadsheet size={44} stroke={1.5} color="var(--pm-muted)" />
          </Dropzone.Idle>
          <div>
            <Text size="lg" inline>
              Drop Excel files here, or click to choose
            </Text>
            <Text size="sm" c="dimmed" inline mt={7}>
              Effort Report · Project Health Tracker · Power BI export · Monitoring spreadsheet
            </Text>
          </div>
        </Group>
      </Dropzone>
      {plans.length > 0 && (
        <Card>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Ready to import</Text>
            <Group gap="xs">
              <Button variant="default" onClick={() => setPlans([])}>
                Clear
              </Button>
              <Button onClick={importAll} loading={busy} disabled={!plans.some((p) => planKinds(p).length)}>
                Import
              </Button>
            </Group>
          </Group>
          <Stack gap="sm">
            {plans.map((p, i) => (
              <Paper key={i} withBorder p="sm" radius="md">
                <Group gap="xs" mb={4}>
                  <IconFileSpreadsheet size={18} />
                  <Text fw={600} size="sm">
                    {p.fileName}
                  </Text>
                  {planKinds(p).map((k) => (
                    <Badge key={k} size="sm">
                      {KIND_LABEL[k]}
                    </Badge>
                  ))}
                </Group>
                {describe(p).length ? (
                  <List size="sm" spacing={2} icon={<ThemeIcon color="teal" size={16} radius="xl"><IconCheck size={10} /></ThemeIcon>}>
                    {describe(p).map((d) => (
                      <List.Item key={d}>{d}</List.Item>
                    ))}
                  </List>
                ) : (
                  <Text size="sm" c="red">
                    Nothing recognised in this file.
                  </Text>
                )}
                {p.ignored.length > 0 && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Sheets left alone: {p.ignored.join(', ')}
                  </Text>
                )}
              </Paper>
            ))}
          </Stack>
        </Card>
      )}
      <Card>
        <Text fw={600} mb="xs">
          What happens on import
        </Text>
        <List size="sm" spacing={4}>
          <List.Item>
            <b>Effort Report</b> – every transaction is written by its number, so re-importing a fresh export updates invoicing statuses and adds new lines without duplicates. Your billable / non-billable choices are kept by transaction number.
          </List.Item>
          <List.Item>
            <b>Power BI export</b> – budgets, revenue, cost, margin, WIP and AR per project, dated today.
          </List.Item>
          <List.Item>
            <b>Monitoring spreadsheet</b> – the schedule grid becomes the Monitoring calendar (marks you’ve made are kept for rows with the same name), the Lab Invoice Tracker fills Lab invoices, and client details go onto the matching projects.
          </List.Item>
          <List.Item>
            <b>Billability Overrides</b> sheet – saved Y/N choices are taken on for transactions that don’t already have one here.
          </List.Item>
        </List>
      </Card>
      {imports.length > 0 && (
        <Card>
          <Text fw={600} mb="xs">
            Previous imports
          </Text>
          <Stack gap={4}>
            {imports.slice(0, 20).map((b) => (
              <Group key={b.id} gap="xs" justify="space-between" wrap="nowrap">
                <Text size="sm" truncate>
                  {b.fileName}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {formatDate(b.at.slice(0, 10))} · {Object.entries(b.counts).map(([k, v]) => `${v} ${k}`).join(', ')}
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
