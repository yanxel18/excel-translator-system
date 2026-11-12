import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Group, Modal, Pagination, Paper, ScrollArea, Select, Skeleton, Stack, Table, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { Download, Eye, FileSpreadsheet, Languages, Trash2 } from 'lucide-react';
import ApiService, { type Job } from '../../api';
import { trackedFetch } from '../../api/client';
import IbisPreview from './IbisPreview';
import { useLocale } from '../shared/LocaleProvider';
import LanguagePair from '../shared/LanguagePair';

export default function HistoryPage({ token, page, onPageChange }: { token: string; page: number; onPageChange: (page: number) => void }) {
  const { t, locale } = useLocale();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [version, setVersion] = useState<'source' | 'translated'>('translated');
  const closePreview = useCallback(() => { setPreviewJob(null); }, []);
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try {
      const result = await ApiService.getHistory(token, nextPage);
      setJobs(result.data);
      setTotal(result.total);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load history.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(page); }, [load, page]);

  const openPreview = (job: Job, nextVersion: 'source' | 'translated') => {
    setError('');
    setPreviewJob(job);
    setVersion(nextVersion);
  };

  const download = async (job: Job) => {
    setError('');
    try {
      const response = await trackedFetch(ApiService.downloadUrl(job.id), { headers: { Authorization: `Bearer ${token}` } });
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
    try {
      await ApiService.deleteHistoryItem(pendingDelete.id, token);
      setPendingDelete(null);
      const nextPage = Math.min(page, Math.max(1, Math.ceil((total - 1) / 5)));
      if (nextPage === page) await load(page); else onPageChange(nextPage);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this workbook.'); setPendingDelete(null); }
  };

  return <Stack gap="md">
    <Group justify="space-between"><div><Text component="h1" fz="h2" fw={700}>{t('Translation history')}</Text><Text size="sm" c="dimmed">{t('Review, preview, download, or remove your workbooks.')}</Text></div><Button variant="default" size="xs" onClick={() => void load(page)} loading={loading}>{t('Refresh')}</Button></Group>
    {error && <Text c="red" role="alert">{error}</Text>}
    {loading && !jobs.length ? <Stack aria-label={t('Loading history')} aria-busy="true"><Skeleton height={58} /><Skeleton height={58} /><Skeleton height={58} /></Stack> : !jobs.length ? <Paper withBorder radius="lg" p="xl"><Stack align="center" gap="xs"><ThemeIcon size={52} radius="xl" variant="light" color="blue"><FileSpreadsheet size={24} /></ThemeIcon><Text fw={600}>{t('No workbooks in history yet.')}</Text><Text size="sm" c="dimmed" ta="center">{t('Upload a workbook to start its translation.')}</Text></Stack></Paper> : <Paper withBorder radius="lg" shadow="sm" style={{ overflow: 'hidden' }}><Group justify="space-between" p="lg"><Box><Text fw={700}>{t('Translation history')}</Text><Text size="sm" c="dimmed">{t('Review, preview, download, or remove your workbooks.')}</Text></Box><Badge color="blue" variant="light">{total}</Badge></Group><ScrollArea><Table highlightOnHover verticalSpacing="md" horizontalSpacing="lg" miw={760}><Table.Thead><Table.Tr><Table.Th>{t('Workbook')}</Table.Th><Table.Th>{t('Status')}</Table.Th><Table.Th>{t('Language')}</Table.Th><Table.Th>{t('Created')}</Table.Th><Table.Th>{t('Actions')}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{jobs.map((job) => <Table.Tr key={job.id}><Table.Td><Group gap="sm" wrap="nowrap"><ThemeIcon size={40} radius="md" color="blue" variant="light"><FileSpreadsheet size={20} /></ThemeIcon><Box><Text fw={600} size="sm">{job.fileName}</Text><Text size="xs" c="dimmed">{(job.fileSize / 1024 / 1024).toFixed(2)} MB</Text></Box></Group></Table.Td><Table.Td><Badge variant="light" color={job.status === 'COMPLETED' ? 'teal' : job.status === 'PROCESSING' ? 'blue' : job.status === 'FAILED' ? 'red' : 'gray'}>{t(job.status.toLowerCase())}</Badge></Table.Td><Table.Td><LanguagePair source={job.sourceLanguage} target={job.targetLanguage} /></Table.Td><Table.Td><Text size="sm">{new Date(job.createdAt).toLocaleString(locale)}</Text></Table.Td><Table.Td><Group gap={4} wrap="nowrap">
      <Tooltip label={t('Preview source')}><ActionIcon variant="subtle" aria-label={`${t('Preview source')} ${job.fileName}`} onClick={() => void openPreview(job, 'source')}><Eye size={16} /></ActionIcon></Tooltip>
      {job.status === 'COMPLETED' && <><Tooltip label={t('Preview translation')}><ActionIcon variant="subtle" aria-label={`${t('Preview translation')} ${job.fileName}`} onClick={() => void openPreview(job, 'translated')}><Languages size={16} /></ActionIcon></Tooltip><Tooltip label={t('Download')}><ActionIcon variant="subtle" aria-label={`${t('Download')} ${job.fileName}`} onClick={() => void download(job)}><Download size={16} /></ActionIcon></Tooltip></>}
      {job.status !== 'PROCESSING' && <Tooltip label={t('Delete')}><ActionIcon variant="subtle" color="red" aria-label={`${t('Delete')} ${job.fileName}`} onClick={() => setPendingDelete(job)}><Trash2 size={16} /></ActionIcon></Tooltip>}
    </Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea></Paper>}
    {total > 5 && <Group justify="center"><Pagination value={page} onChange={onPageChange} total={Math.ceil(total / 5)} disabled={loading} /></Group>}
    <Modal opened={Boolean(previewJob)} onClose={closePreview} title={<Group justify="space-between" wrap="nowrap" gap="md" style={{ minWidth: 0, flex: 1 }}><Text size="sm" fw={600} truncate>{previewJob?.fileName ?? t('Workbook preview')}</Text><Select aria-label={t('Preview version')} value={version} data={[{ value: 'source', label: t('Original') }, { value: 'translated', label: t('Translated') }]} onChange={(value) => { if (value) setVersion(value as 'source' | 'translated'); }} w={150} /></Group>} size="95%" centered>
      {previewJob && <IbisPreview key={`${previewJob.id}-${version}`} jobId={previewJob.id} name={previewJob.fileName} version={version} token={token} onClose={closePreview} />}
    </Modal>
    <Modal opened={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} title={t('Delete workbook?')} centered><Stack><Text size="sm">{t('This removes {name} and its stored workbook files.').replace('{name}', pendingDelete?.fileName ?? '')}</Text><Group justify="end"><Button variant="default" onClick={() => setPendingDelete(null)}>{t('Cancel')}</Button><Button color="red" onClick={() => void deleteJob()}>{t('Delete')}</Button></Group></Stack></Modal>
  </Stack>;
}
