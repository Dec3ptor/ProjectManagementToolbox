import { useRef } from 'react';
import { Button, Card, Group, NumberInput, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { IconDownload, IconTrash, IconUpload } from '@tabler/icons-react';
import { saveSettings } from '../db/db';
import { clearAll, exportBackup, isBackup, restoreBackup } from '../db/backup';
import { PageHeader, download } from '../components/common';
import { useSettings } from '../hooks/useData';
import { askNotificationPermission, notificationsSupported } from '../hooks/useNotifications';
import { APP_BUILD, APP_VERSION } from '../lib/version';
import { todayStr } from '../lib/dates';

export function SettingsPage() {
  const s = useSettings();
  const file = useRef<HTMLInputElement>(null);
  const backup = async () => {
    const b = await exportBackup(APP_VERSION);
    download(`pm-toolbox-backup-${todayStr()}.json`, JSON.stringify(b), 'application/json');
  };
  const restore = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text());
      if (!isBackup(parsed)) throw new Error('Not a PM Toolbox backup');
      modals.openConfirmModal({
        title: 'Restore this backup?',
        children: <Text size="sm">Everything here is replaced by the backup from {parsed.exportedAt.slice(0, 10)}.</Text>,
        labels: { confirm: 'Restore', cancel: 'Cancel' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          await restoreBackup(parsed);
          notifications.show({ message: 'Backup restored', color: 'teal' });
        },
      });
    } catch (e) {
      notifications.show({ title: 'Could not restore', message: (e as Error).message, color: 'red' });
    }
  };
  const wipe = () =>
    modals.openConfirmModal({
      title: 'Delete everything?',
      children: <Text size="sm">All projects, transactions, choices, lab invoices and billing records in this browser are deleted. Take a backup first.</Text>,
      labels: { confirm: 'Delete everything', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await clearAll();
        notifications.show({ message: 'Everything deleted', color: 'teal' });
      },
    });

  return (
    <Stack gap="md" maw={820}>
      <PageHeader title="Settings & backup" />
      <Card>
        <Text fw={600} mb="xs">
          You
        </Text>
        <TextInput label="Your name, as the exports write it" description="Projects whose manager matches are marked as yours on import. Surname and first name, in either order, e.g. “Foote, Benjamin”." defaultValue={s.myName} onBlur={(e) => e.currentTarget.value !== s.myName && saveSettings({ myName: e.currentTarget.value.trim() })} placeholder="Surname, First name" />
        <TextInput label="Accounts payable e-mail" description="Where lab invoices are sent for payment – used in the e-mail that is copied for you." defaultValue={s.apEmail} onBlur={(e) => e.currentTarget.value !== s.apEmail && saveSettings({ apEmail: e.currentTarget.value.trim() })} mt="sm" />
      </Card>
      <Card>
        <Text fw={600} mb="xs">
          Alerts
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput label="Billing due by day of the month" description="Last month’s billing is overdue after this day" value={s.billingDueDay} min={1} max={28} onChange={(v) => typeof v === 'number' && saveSettings({ billingDueDay: v })} />
          <NumberInput label="Lab invoice overdue after (days)" description="Received but not sent to AP" value={s.apOverdueDays} min={1} max={90} onChange={(v) => typeof v === 'number' && saveSettings({ apOverdueDays: v })} />
          <NumberInput label="Budget warning at (% of cost spent)" value={s.budgetWarnPct} min={1} max={100} onChange={(v) => typeof v === 'number' && saveSettings({ budgetWarnPct: v })} />
          <NumberInput label="Budget danger at (% of cost spent)" value={s.budgetDangerPct} min={1} max={150} onChange={(v) => typeof v === 'number' && saveSettings({ budgetDangerPct: v })} />
          <NumberInput label="Margin warning below (%)" value={s.marginWarnPct} min={-100} max={100} onChange={(v) => typeof v === 'number' && saveSettings({ marginWarnPct: v })} />
          <NumberInput label="Ask for a fresh Effort Report after (days)" value={s.staleImportDays} min={1} max={90} onChange={(v) => typeof v === 'number' && saveSettings({ staleImportDays: v })} />
        </SimpleGrid>
        <Switch
          mt="md"
          label="Browser notifications"
          description={notificationsSupported() ? 'Once a day while the app is open, the pressing alerts pop up as a notification.' : 'This browser does not support notifications.'}
          checked={s.browserNotifications}
          disabled={!notificationsSupported()}
          onChange={async (e) => {
            const on = e.currentTarget.checked;
            if (on && !(await askNotificationPermission())) {
              notifications.show({ message: 'The browser did not allow notifications', color: 'red' });
              return;
            }
            await saveSettings({ browserNotifications: on });
          }}
        />
      </Card>
      <Card>
        <Text fw={600} mb="xs">
          Parts of the app
        </Text>
        <Text size="sm" c="dimmed" mb="sm">
          Switch off what you don’t use; it leaves the menu, the dashboard and the alerts. Anything imported stays and comes back when switched on.
        </Text>
        <Stack gap="xs">
          <Switch label="Monitoring calendar" description="The monitoring schedule grid, with rounds and annual reports in the alerts" checked={s.features.calendar} onChange={(e) => saveSettings({ features: { ...s.features, calendar: e.currentTarget.checked } })} />
          <Switch label="Lab invoices" description="The lab invoice → AP tracker, with invoices waiting in the alerts" checked={s.features.labInvoices} onChange={(e) => saveSettings({ features: { ...s.features, labInvoices: e.currentTarget.checked } })} />
        </Stack>
      </Card>
      <Card>
        <Text fw={600} mb="xs">
          Backup
        </Text>
        <Text size="sm" c="dimmed" mb="sm">
          Everything lives in this browser. Download a backup now and then (and before clearing the browser’s data), and restore it here on another computer.
        </Text>
        <Group>
          <Button leftSection={<IconDownload size={16} />} onClick={backup}>
            Download backup
          </Button>
          <Button variant="default" leftSection={<IconUpload size={16} />} onClick={() => file.current?.click()}>
            Restore a backup
          </Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={wipe}>
            Delete everything
          </Button>
        </Group>
      </Card>
      <Text size="xs" c="dimmed">
        PM Toolbox {APP_VERSION}
        {APP_BUILD.commit !== 'dev' ? ` · build ${APP_BUILD.commit} (${APP_BUILD.date})` : ''}. Runs entirely in your browser from GitHub Pages; no data is sent anywhere.
      </Text>
    </Stack>
  );
}
