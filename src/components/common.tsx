import type { ReactNode } from 'react';
import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { LabInvoiceStatus } from '../db/types';
import { HEALTH_META, type HealthLevel } from '../lib/health';

export function PageHeader({ title, description, actions, badge }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; badge?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm">
      <Stack gap={2} style={{ minWidth: 0, flex: '1 1 260px' }}>
        <Group gap="xs" wrap="nowrap">
          <Title order={2} fz={{ base: 20, sm: 24 }} style={{ overflowWrap: 'anywhere' }}>
            {title}
          </Title>
          {badge}
        </Group>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

export function StatTile({ label, value, sub, color, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; icon?: ReactNode; onClick?: () => void }) {
  return (
    <Paper withBorder p="md" radius="md" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text fw={650} fz={26} lh={1.1} c={color} className="tabular">
            {value}
          </Text>
          {sub && (
            <Text size="xs" c="dimmed">
              {sub}
            </Text>
          )}
        </Stack>
        {icon}
      </Group>
    </Paper>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <Paper withBorder p="xl" radius="md">
      <Stack align="center" gap="xs" ta="center">
        <ThemeIcon size={44} radius="xl" variant="light" color="gray">
          {icon ?? <IconInbox size={24} />}
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
        {children && (
          <Text size="sm" c="dimmed" maw={520}>
            {children}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export function HealthBadge({ level, size = 'sm' }: { level: HealthLevel; size?: 'xs' | 'sm' | 'md' }) {
  const m = HEALTH_META[level];
  return (
    <Badge color={m.color} variant={level === 'critical' ? 'filled' : 'light'} size={size}>
      {m.label}
    </Badge>
  );
}

export const LAB_STATUS: Record<LabInvoiceStatus, { label: string; color: string }> = {
  awaiting: { label: 'Awaiting lab invoice', color: 'gray' },
  received: { label: 'Received – not sent to AP', color: 'orange' },
  sent: { label: 'Sent to AP', color: 'blue' },
  query: { label: 'Query / on hold', color: 'red' },
  paid: { label: 'Paid', color: 'teal' },
  na: { label: 'N/A – no lab costs', color: 'gray' },
};

export function LabStatusBadge({ status }: { status: LabInvoiceStatus }) {
  const m = LAB_STATUS[status];
  return (
    <Badge color={m.color} variant={status === 'query' ? 'filled' : 'light'} size="sm">
      {m.label}
    </Badge>
  );
}

export function BillableBadge({ on, changed }: { on: boolean; changed?: boolean }) {
  return (
    <Badge size="sm" color={on ? 'teal' : 'gray'} variant={changed ? 'filled' : 'light'} title={changed ? 'Changed here – differs from the export' : undefined}>
      {on ? 'Billable' : 'Non-billable'}
      {changed ? ' *' : ''}
    </Badge>
  );
}

/** Downloads a file made in the browser. */
export function download(name: string, data: BlobPart, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}
