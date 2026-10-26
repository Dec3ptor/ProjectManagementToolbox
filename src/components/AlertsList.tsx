import { Badge, Group, Paper, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconExclamationCircle, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { KIND_META, type Alert, type Severity } from '../lib/alerts';

const ICON: Record<Severity, { icon: typeof IconInfoCircle; color: string }> = {
  critical: { icon: IconExclamationCircle, color: 'red' },
  warning: { icon: IconAlertTriangle, color: 'orange' },
  info: { icon: IconInfoCircle, color: 'blue' },
};

export function AlertsList({ alerts, limit, empty = 'Nothing needs attention right now.' }: { alerts: Alert[]; limit?: number; empty?: string }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  if (!shown.length)
    return (
      <Group gap="xs" p="sm">
        <ThemeIcon color="teal" variant="light" radius="xl">
          <IconCircleCheck size={18} />
        </ThemeIcon>
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      </Group>
    );
  return (
    <Stack gap={6}>
      {shown.map((a) => {
        const m = ICON[a.severity];
        return (
          <UnstyledButton key={a.id} component={Link} to={a.link}>
            <Paper withBorder p="xs" radius="md">
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon color={m.color} variant="light" radius="xl" size="md" mt={2}>
                  <m.icon size={16} />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {a.title}
                    </Text>
                    <Badge size="xs" color={KIND_META[a.kind].color} variant="light">
                      {KIND_META[a.kind].label}
                    </Badge>
                  </Group>
                  {a.detail && (
                    <Text size="xs" c="dimmed">
                      {a.detail}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Paper>
          </UnstyledButton>
        );
      })}
      {limit && alerts.length > limit && (
        <Text size="xs" c="dimmed" ta="center">
          and {alerts.length - limit} more
        </Text>
      )}
    </Stack>
  );
}
