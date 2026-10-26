import { useMemo, useState } from 'react';
import { Button, Group, Paper, ScrollArea, SegmentedControl, Stack, Switch, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router-dom';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { db } from '../db/db';
import { HealthBadge, PageHeader } from '../components/common';
import { projectPath, useEverything } from '../hooks/useData';
import { HEALTH_META, projectHealth } from '../lib/health';
import { money, pct, hours, shortName } from '../lib/format';
import { nowIso } from '../lib/dates';
import { normaliseCode } from '../lib/matching';

export function ProjectsPage() {
  const { projects, txns, overrides, settings } = useEverything();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const rows = useMemo(() => {
    const byProject = new Map<string, typeof txns>();
    for (const t of txns) {
      if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
      byProject.get(t.projectId)!.push(t);
    }
    const s = q.trim().toLowerCase();
    return projects
      .filter((p) => (scope === 'all' || p.mine) && (!s || `${p.name} ${p.id} ${p.customer ?? ''} ${p.aliases.join(' ')}`.toLowerCase().includes(s)))
      .map((p) => ({ p, h: projectHealth(p, byProject.get(p.id) ?? [], overrides, settings) }))
      .sort((a, b) => Number(b.p.status === 'active') - Number(a.p.status === 'active') || HEALTH_META[a.h.level].order - HEALTH_META[b.h.level].order || a.p.name.localeCompare(b.p.name));
  }, [projects, txns, overrides, settings, q, scope]);

  const addProject = () => {
    let id = '';
    let name = '';
    modals.openConfirmModal({
      title: 'New project',
      children: (
        <Stack gap="xs">
          <TextInput label="Project number" placeholder="e.g. NZL-WSP-2-34646.00" onChange={(e) => (id = e.currentTarget.value)} data-autofocus />
          <TextInput label="Name" onChange={(e) => (name = e.currentTarget.value)} />
          <Text size="xs" c="dimmed">
            Projects also appear by themselves when you import an Effort Report or Power BI export.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Add', cancel: 'Cancel' },
      onConfirm: async () => {
        if (!id.trim()) return;
        const now = nowIso();
        await db.projects.put({ id: id.trim(), name: name.trim() || id.trim(), status: 'active', mine: true, aliases: [normaliseCode(id)].filter((a) => a !== id.trim().toLowerCase()), createdAt: now, updatedAt: now });
      },
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Projects"
        description="Every project the exports mention. Tick “mine” for the ones you manage: those are billed and watched here."
        actions={
          <Button leftSection={<IconPlus size={16} />} variant="light" onClick={addProject}>
            New project
          </Button>
        }
      />
      <Group gap="xs">
        <TextInput placeholder="Search" leftSection={<IconSearch size={14} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: '1 1 200px' }} />
        <SegmentedControl value={scope} onChange={(v) => setScope(v as 'mine' | 'all')} data={[{ label: 'Mine', value: 'mine' }, { label: 'All', value: 'all' }]} />
      </Group>
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea type="auto">
          <table className="pm-grid">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Health</th>
                <th className="num">Budget (cost)</th>
                <th className="num">Spent</th>
                <th className="num">Margin</th>
                <th className="num">Hours</th>
                <th className="num">Unbilled</th>
                <th className="num">WIP</th>
                <th className="num">AR</th>
                <th>Mine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, h }) => (
                <tr key={p.id} className={p.status === 'active' ? undefined : 'off'}>
                  <td>
                    <Text component={Link} to={projectPath(p.id)} size="sm" fw={600} c="inherit" td="none">
                      {shortName(p.name)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {p.id}
                      {p.status !== 'active' ? ` · ${p.status}` : ''}
                    </Text>
                  </td>
                  <td>{p.customer ?? ''}</td>
                  <td>
                    <HealthBadge level={h.level} />
                  </td>
                  <td className="num">{money(p.fin?.budgetCost)}</td>
                  <td className="num">{pct(h.spent)}</td>
                  <td className="num">{pct(h.margin)}</td>
                  <td className="num">{hours(h.totals.hours)}</td>
                  <td className="num">{money(h.totals.unbilledEffort)}</td>
                  <td className="num">{money(p.fin?.totalWIP)}</td>
                  <td className="num">{money(p.fin?.totalAR)}</td>
                  <td>
                    <Switch size="xs" checked={p.mine} onChange={(e) => db.projects.update(p.id, { mine: e.currentTarget.checked, updatedAt: nowIso() })} aria-label="Mine" />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={11}>
                    <Text size="sm" c="dimmed" p="md">
                      {scope === 'mine' ? 'No projects marked as yours. Switch to All, or import your exports.' : 'No projects yet – import an Effort Report or Power BI export.'}
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
