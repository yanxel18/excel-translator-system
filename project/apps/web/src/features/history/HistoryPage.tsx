import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Button, Group, Modal, Paper, ScrollArea, Select, Skeleton, Stack, Table, Text, Tooltip } from '@mantine/core';
import { Download, Eye, Trash2 } from 'lucide-react';
import ApiService, { type Job, type WorkbookPreview } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

export default function HistoryPage({ token }: { token: string }) {
  const { t, locale } = useLocale();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [version, setVersion] = useState<'source' | 'translated'>('translated');
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);

  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try {
      const page = await ApiService.getHistory(token, next);
      setJobs((current) => next ? [...current, ...page.data] : page.data);
      setCursor(page.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load history.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const openPreview = async (job: Job, nextVersion: 'source' | 'translated') => {
    setError('');
    try { setPreview(await ApiService.getWorkbookPreview(job.id, nextVersion, token)); setPreviewJob(job); setVersion(nextVersion); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load workbook preview.'); }
  };

  const download = async (job: Job) => {
    setError('');
    try {
      const response = await fetch(ApiService.downloadUrl(job.id), { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Download failed.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${job.fileName.replace(/\.xlsx$/i, '')}-translated.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download failed.'); }
  };

  const deleteJob = async () => {
    if (!pendingDelete) return;
    setError('');
    try { await ApiService.deleteHistoryItem(pendingDelete.id, token); setPendingDelete(null); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this workbook.'); setPendingDelete(null); }
  };

  return <Stack gap="md">
    <Group justify="space-between"><div><Text component="h1" fz="h2" fw={700}>{t('Translation history')}</Text><Text size="sm" c="dimmed">{t('Review, preview, download, or remove your workbooks.')}</Text></div><Button variant="default" size="xs" onClick={() => void load()} loading={loading}>{t('Refresh')}</Button></Group>
    {error && <Text c="red" role="alert">{error}</Text>}
    {loading && !jobs.length ? <Stack aria-label={t('Loading history')} aria-busy="true"><Skeleton height={58} /><Skeleton height={58} /><Skeleton height={58} /></Stack> : !jobs.length ? <Paper withBorder p="xl"><Text c="dimmed">{t('No workbooks in history yet.')}</Text></Paper> : <Paper withBorder radius="md"><ScrollArea><Table striped highlightOnHover miw={700}><Table.Thead><Table.Tr><Table.Th>{t('Workbook')}</Table.Th><Table.Th>{t('Status')}</Table.Th><Table.Th>{t('Created')}</Table.Th><Table.Th>{t('Actions')}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{jobs.map((job) => <Table.Tr key={job.id}><Table.Td><Text fw={500}>{job.fileName}</Text></Table.Td><Table.Td>{t(job.status.toLowerCase())}</Table.Td><Table.Td>{new Date(job.createdAt).toLocaleString(locale)}</Table.Td><Table.Td><Group gap={4} wrap="nowrap">
      <Tooltip label={t('Preview source')}><ActionIcon variant="subtle" aria-label={`${t('Preview source')} ${job.fileName}`} onClick={() => void openPreview(job, 'source')}><Eye size={16} /></ActionIcon></Tooltip>
      {job.status === 'COMPLETED' && <><Tooltip label={t('Preview translation')}><ActionIcon variant="subtle" aria-label={`${t('Preview translation')} ${job.fileName}`} onClick={() => void openPreview(job, 'translated')}><Text size="xs">EN</Text></ActionIcon></Tooltip><Tooltip label={t('Download')}><ActionIcon variant="subtle" aria-label={`${t('Download')} ${job.fileName}`} onClick={() => void download(job)}><Download size={16} /></ActionIcon></Tooltip></>}
      {job.status !== 'PROCESSING' && <Tooltip label={t('Delete')}><ActionIcon variant="subtle" color="red" aria-label={`${t('Delete')} ${job.fileName}`} onClick={() => setPendingDelete(job)}><Trash2 size={16} /></ActionIcon></Tooltip>}
    </Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea></Paper>}
    {cursor && <Group justify="center"><Button variant="default" loading={loading} onClick={() => void load(cursor)}>{t('Load more')}</Button></Group>}
    <Modal opened={Boolean(preview)} onClose={() => { setPreview(null); setPreviewJob(null); }} title={previewJob?.fileName ?? t('Workbook preview')} size="xl" centered>
      {preview && <Stack><Group justify="space-between"><Text size="sm" c="dimmed">{t('Showing up to 50 rows and 20 columns per sheet.')}</Text><Select aria-label={t('Preview version')} value={version} data={[{ value: 'source', label: t('Original') }, { value: 'translated', label: t('Translated') }]} onChange={(value) => { if (value && previewJob) void openPreview(previewJob, value as 'source' | 'translated'); }} /></Group>
        {preview.sheets.map((sheet) => <Stack key={sheet.name} gap="xs"><Text fw={600}>{sheet.name}</Text><ScrollArea><Table withTableBorder withColumnBorders fz="xs"><Table.Tbody>{sheet.rows.map((row, index) => <Table.Tr key={`${sheet.name}-${index}`}>{row.map((cell, column) => <Table.Td key={column}>{cell}</Table.Td>)}</Table.Tr>)}</Table.Tbody></Table></ScrollArea></Stack>)}</Stack>}
    </Modal>
    <Modal opened={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title={t('Delete workbook?')} centered><Stack><Text size="sm">{t('This removes {name} and its stored workbook files.').replace('{name}', pendingDelete?.fileName ?? '')}</Text><Group justify="end"><Button variant="default" onClick={() => setPendingDelete(null)}>{t('Cancel')}</Button><Button color="red" onClick={() => void deleteJob()}>{t('Delete')}</Button></Group></Stack></Modal>
  </Stack>;
}
