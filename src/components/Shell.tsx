import { useEffect } from 'react';
import { ActionIcon, AppShell, Badge, Box, Burger, Divider, Group, Indicator, NavLink, ScrollArea, Text, useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { IconBell, IconCalendarMonth, IconChartBar, IconFileInvoice, IconFolders, IconLayoutDashboard, IconMoon, IconReceipt2, IconSettings, IconSun, IconUpload, IconUsers } from '@tabler/icons-react';
import { projectPath, useEverything } from '../hooks/useData';
import { useBrowserNotifications } from '../hooks/useNotifications';
import { APP_VERSION, APP_BUILD } from '../lib/version';
import { shortName } from '../lib/format';

export function Shell() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { projects, alerts, settings } = useEverything();
  useEffect(() => close(), [location.pathname, close]);
  useBrowserNotifications(alerts, settings);
  const path = location.pathname;
  const urgent = alerts.filter((a) => a.severity !== 'info').length;

  const nav = [
    { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, active: path === '/' },
    { to: '/projects', label: 'Projects', icon: IconFolders, active: path.startsWith('/projects') },
    { to: '/billing', label: 'Monthly billing', icon: IconReceipt2, active: path.startsWith('/billing') },
    { to: '/people', label: 'People & time', icon: IconUsers, active: path.startsWith('/people') },
    { to: '/lab-invoices', label: 'Lab invoices', icon: IconFileInvoice, active: path.startsWith('/lab-invoices') },
    { to: '/calendar', label: 'Monitoring calendar', icon: IconCalendarMonth, active: path.startsWith('/calendar') },
    { to: '/import', label: 'Import data', icon: IconUpload, active: path.startsWith('/import') },
  ];
  const mine = projects.filter((p) => p.mine && p.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 250, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Box style={{ background: 'var(--mantine-primary-color-filled)', borderRadius: 8, width: 30, height: 30, display: 'grid', placeItems: 'center' }}>
                <IconChartBar size={18} color="white" />
              </Box>
              <Text fw={700} size="lg">
                PM Toolbox
              </Text>
            </Link>
            <Text c="dimmed" size="sm" visibleFrom="md">
              Projects · billing · lab invoices
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Indicator disabled={!urgent} label={urgent} size={16} color="red" offset={4}>
              <ActionIcon component={Link} to="/" variant="default" size="lg" aria-label="Alerts" title={`${alerts.length} alerts`}>
                <IconBell size={18} />
              </ActionIcon>
            </Indicator>
            <ActionIcon variant="default" size="lg" onClick={() => toggleColorScheme()} aria-label="Toggle colour scheme">
              {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <AppShell.Section>
          {nav.map((n) => (
            <NavLink key={n.to} component={Link} to={n.to} label={n.label} leftSection={<n.icon size={18} stroke={1.6} />} active={n.active} variant="light" style={{ borderRadius: 8 }} rightSection={n.to === '/' && urgent ? <Badge size="sm" color="red" variant="filled">{urgent}</Badge> : undefined} />
          ))}
        </AppShell.Section>
        <Divider my={6} label="My projects" labelPosition="left" />
        <AppShell.Section grow component={ScrollArea}>
          {mine.map((p) => (
            <NavLink key={p.id} component={Link} to={projectPath(p.id)} label={shortName(p.name)} description={p.id} active={path.startsWith(projectPath(p.id))} variant="light" style={{ borderRadius: 8 }} />
          ))}
          {!mine.length && (
            <Text size="sm" c="dimmed" px="sm">
              None yet – import an Effort Report, or tick “mine” on a project.
            </Text>
          )}
        </AppShell.Section>
        <AppShell.Section>
          <NavLink component={Link} to="/settings" label="Settings & backup" leftSection={<IconSettings size={18} stroke={1.6} />} active={path.startsWith('/settings')} variant="light" style={{ borderRadius: 8 }} />
          <Text size="xs" c="dimmed" px="sm" py={4}>
            Saved in this browser. Back up from Settings. v{APP_VERSION}
            {APP_BUILD.commit !== 'dev' ? ` · ${APP_BUILD.commit}` : ''}
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
