import { useMemo, useState } from 'react';
import { Card, Group, Paper, ScrollArea, SegmentedControl, Select, Stack, Text, useMantineColorScheme } from '@mantine/core';
import { PageHeader, EmptyState } from '../components/common';
import { EChart, axes } from '../charts/EChart';
import { useEverything } from '../hooks/useData';
import { byPerson, byProject, isHours } from '../lib/billability';
import { addMonths, formatMonth, monthOf } from '../lib/dates';
import { money, num, pct, shortName } from '../lib/format';

/** Who has spent time on my projects, and on which. */
export function PeoplePage() {
  const { projects, txns, overrides, today } = useEverything();
  const [range, setRange] = useState<'month' | 'last' | '3m' | 'all'>('3m');
  const [projectId, setProjectId] = useState<string | null>(null);
  const { colorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';
  const mine = new Set(projects.filter((p) => p.mine).map((p) => p.id));
  const shown = useMemo(() => {
    const m = monthOf(today);
    const from = range === 'month' ? m : range === 'last' ? addMonths(m, -1) : range === '3m' ? addMonths(m, -2) : '0000';
    const to = range === 'last' ? addMonths(m, -1) : '9999';
    return txns.filter((t) => (projectId ? t.projectId === projectId : mine.has(t.projectId)) && monthOf(t.date) >= from && monthOf(t.date) <= to);
  }, [txns, range, projectId, today, mine]);
  const people = useMemo(() => byPerson(shown.filter(isHours), overrides), [shown, overrides]);
  const perProject = useMemo(() => byProject(shown.filter(isHours), overrides), [shown, overrides]);
  const chart = useMemo(() => {
    const ax = axes(dark);
    const top = people.slice(0, 10);
    return {
      legend: { top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      xAxis: { type: 'value', ...ax.yAxis, axisLabel: { ...ax.yAxis.axisLabel, formatter: '{value} h' } },
      yAxis: { type: 'category', data: top.map((p) => p.label).reverse(), ...ax.xAxis },
      series: [
        { name: 'Billable hours', type: 'bar', stack: 'h', data: top.map((p) => Number(p.totals.billableHours.toFixed(2))).reverse(), barMaxWidth: 22, itemStyle: { borderColor: dark ? '#1a1a19' : '#fff', borderWidth: 1 } },
        { name: 'Non-billable hours', type: 'bar', stack: 'h', data: top.map((p) => Number(p.totals.nonBillableHours.toFixed(2))).reverse(), barMaxWidth: 22, itemStyle: { borderRadius: [0, 4, 4, 0], borderColor: dark ? '#1a1a19' : '#fff', borderWidth: 1 } },
      ],
    };
  }, [people, dark]);

  return (
    <Stack gap="md">
      <PageHeader title="People & time" description="Who has put hours into your projects, billable or not, and on which project." />
      <Group gap="xs">
        <SegmentedControl value={range} onChange={(v) => setRange(v as typeof range)} data={[{ label: 'This month', value: 'month' }, { label: 'Last month', value: 'last' }, { label: 'Last 3 months', value: '3m' }, { label: 'Everything', value: 'all' }]} />
        <Select placeholder="All my projects" clearable value={projectId} onChange={setProjectId} data={projects.filter((p) => p.mine || p.id === projectId).map((p) => ({ value: p.id, label: shortName(p.name) }))} w={300} searchable />
      </Group>
      {!shown.length ? (
        <EmptyState title="No hours in this range">Import an Effort Report, or widen the range.</EmptyState>
      ) : (
        <>
          <Card>
            <Text fw={600} mb="xs">
              Hours per person
            </Text>
            <EChart option={chart} height={Math.max(200, Math.min(people.length, 10) * 36 + 60)} />
          </Card>
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <ScrollArea type="auto">
              <table className="pm-grid">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="num">Hours</th>
                    <th className="num">Billable h</th>
                    <th className="num">Non-billable h</th>
                    <th className="num">NB %</th>
                    <th className="num">Cost</th>
                    <th className="num">Billable amount</th>
                    <th className="num">Unbilled</th>
                    <th>Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((g) => (
                    <tr key={g.key}>
                      <td>{g.label}</td>
                      <td className="num">{num(g.totals.hours)}</td>
                      <td className="num">{num(g.totals.billableHours)}</td>
                      <td className="num">{num(g.totals.nonBillableHours)}</td>
                      <td className="num">{pct(g.totals.nonBillablePct)}</td>
                      <td className="num">{money(g.totals.cost)}</td>
                      <td className="num">{money(g.totals.billableEffort)}</td>
                      <td className="num">{money(g.totals.unbilledEffort)}</td>
                      <td className="wrap">
                        <Text size="xs" span>
                          {[...new Set(g.txns.map((t) => t.projectId.replace(/^NZL-WSP-/, '')))].join(', ')}
                        </Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Paper>
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <ScrollArea type="auto">
              <table className="pm-grid">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Hours</th>
                    <th className="num">Billable h</th>
                    <th className="num">Non-billable h</th>
                    <th className="num">Cost</th>
                    <th className="num">Billable amount</th>
                    <th>People</th>
                  </tr>
                </thead>
                <tbody>
                  {perProject.map((g) => (
                    <tr key={g.key}>
                      <td>{shortName(projects.find((p) => p.id === g.key)?.name ?? g.key)}</td>
                      <td className="num">{num(g.totals.hours)}</td>
                      <td className="num">{num(g.totals.billableHours)}</td>
                      <td className="num">{num(g.totals.nonBillableHours)}</td>
                      <td className="num">{money(g.totals.cost)}</td>
                      <td className="num">{money(g.totals.billableEffort)}</td>
                      <td className="wrap">
                        <Text size="xs" span>
                          {[...new Set(g.txns.map((t) => t.person).filter(Boolean))].join(', ')}
                        </Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </Paper>
          <Text size="xs" c="dimmed">
            Showing {range === 'all' ? 'all months' : range === 'month' ? formatMonth(monthOf(today), true) : range === 'last' ? formatMonth(addMonths(monthOf(today), -1), true) : `${formatMonth(addMonths(monthOf(today), -2))} – ${formatMonth(monthOf(today))}`}.
          </Text>
        </>
      )}
    </Stack>
  );
}
