// "Ask AI": the project written out for an assistant, to copy or download and paste into ChatGPT, Claude, Copilot…

import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconDownload, IconSparkles } from '@tabler/icons-react';
import type { Project } from '../db/types';
import { useCycles, useLabInvoices, useOverrides, useSettings, useTransactions } from '../hooks/useData';
import { buildProjectPack, DEFAULT_PACK, packSize, type PackOptions } from '../lib/aiPack';
import { shortName } from '../lib/format';
import { todayStr } from '../lib/dates';
import { copyText, download } from './common';

export function AskAiButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="light" leftSection={<IconSparkles size={16} />} onClick={() => setOpen(true)}>
        Ask AI
      </Button>
      {open && <AskAiModal project={project} onClose={() => setOpen(false)} />}
    </>
  );
}

function AskAiModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const txns = useTransactions(project.id);
  const overrides = useOverrides(project.id);
  const cycles = useCycles();
  const labInvoices = useLabInvoices();
  const settings = useSettings();
  const [opts, setOpts] = useState<PackOptions>({ ...DEFAULT_PACK, labInvoices: settings.features.labInvoices });
  const set = (patch: Partial<PackOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const pack = useMemo(() => buildProjectPack({ project, txns, overrides, cycles, labInvoices, settings }, opts), [project, txns, overrides, cycles, labInvoices, settings, opts]);
  const size = packSize(pack);
  const fileName = `${shortName(project.name).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '')}-briefing-${todayStr()}.md`;

  const copy = async () => {
    const ok = await copyText(pack);
    notifications.show({ message: ok ? 'Copied – paste it into your AI assistant, then ask away' : 'Could not copy; use Download instead', color: ok ? 'teal' : 'red' });
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={700}>Ask AI about {shortName(project.name)}</Text>} size="xl">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          This writes the project out as text: its money, health, hours by person, task and month, the billing record and (if you like) every transaction. Copy it, paste it into ChatGPT, Claude, Copilot or whichever assistant you use, and ask your questions. Nothing is sent anywhere from here.
        </Text>
        <Group gap="md" wrap="wrap" align="flex-end">
          <Checkbox label="Every transaction" description="Each line of time and cost" checked={opts.transactions} onChange={(e) => set({ transactions: e.currentTarget.checked })} />
          <Checkbox label="Comments" description="What people wrote on their time" checked={opts.comments} disabled={!opts.transactions} onChange={(e) => set({ comments: e.currentTarget.checked })} />
          <Checkbox label="Anonymise people" description="Initials instead of names; suppliers numbered" checked={opts.anonymise} onChange={(e) => set({ anonymise: e.currentTarget.checked })} />
          {settings.features.labInvoices && <Checkbox label="Lab invoices" checked={opts.labInvoices} onChange={(e) => set({ labInvoices: e.currentTarget.checked })} />}
          <div>
            <Text size="xs" fw={500} mb={4}>
              Transactions from
            </Text>
            <SegmentedControl size="xs" value={String(opts.months)} onChange={(v) => set({ months: Number(v) })} data={[{ label: 'All time', value: '0' }, { label: 'Last 3 months', value: '3' }, { label: 'Last 6 months', value: '6' }, { label: 'Last 12 months', value: '12' }]} disabled={!opts.transactions} />
          </div>
        </Group>
        {!opts.anonymise && (
          <Alert color="yellow" p="xs">
            The text names your colleagues, their hours and costs, and the client. Check what your organisation allows before pasting it into an outside AI service; tick <b>Anonymise people</b> to use initials.
          </Alert>
        )}
        <Textarea value={pack} readOnly autosize minRows={12} maxRows={18} styles={{ input: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 } }} />
        <Group justify="space-between" wrap="wrap">
          <Text size="xs" c="dimmed" className="tabular">
            {size.chars.toLocaleString('en-NZ')} characters · about {size.tokens.toLocaleString('en-NZ')} tokens{size.tokens > 100000 ? ' – large; try a shorter period or leave the transactions out' : ''}
          </Text>
          <Group gap="xs">
            <Button variant="default" leftSection={<IconDownload size={16} />} onClick={() => download(fileName, pack, 'text/markdown')}>
              Download .md
            </Button>
            <Button leftSection={<IconCopy size={16} />} onClick={copy}>
              Copy
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
