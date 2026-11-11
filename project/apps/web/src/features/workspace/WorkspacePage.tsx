import { RefObject } from 'react';
import { ActionIcon, Badge, Box, Breadcrumbs, Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { CheckCircle2, ChevronRight, CloudUpload, FileSpreadsheet } from 'lucide-react';
import { Job } from '../../api';
import JobList, { LoadingJobs } from './JobList';
import { useLocale } from '../shared/LocaleProvider';

interface WorkspacePageProps {
  file: File | null;
  fileInput: RefObject<HTMLInputElement>;
  error: string;
  busy: boolean;
  jobs: Job[];
  jobsLoading: boolean;
  onDismissError: () => void;
  onSelectFile: (file: File | null) => void;
  onUpload: () => void;
  onRefresh: () => void;
  onStart: (job: Job) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDownload: (job: Job) => void;
  onConfigure: (job: Job) => void;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function WorkspacePage({
  file, fileInput, error, busy, jobs, jobsLoading,
  onDismissError, onSelectFile, onUpload, onRefresh, onStart, onRetry, onCancel, onDownload, onConfigure,
}: WorkspacePageProps) {
  const { t } = useLocale();
  return <Stack gap="xl">
    <Breadcrumbs separator={<ChevronRight size={14} />}><Text size="sm">{t('Workspace')}</Text></Breadcrumbs>
    <Group justify="space-between" align="end"><Box><Text component="h1" fz="h1" fw={700}>{t('Translate a workbook')}</Text><Text c="dimmed" mt={4}>{t('Upload an XLSX file and keep track of every translation.')}</Text></Box><Badge variant="light" color="teal" size="lg">XLSX · {t('up to 50 MB')}</Badge></Group>
    {error && <Paper withBorder radius="md" p="sm" bg="red.0"><Group justify="space-between"><Text c="red" size="sm" role="alert">{error}</Text><ActionIcon variant="subtle" color="red" aria-label={t('Dismiss error')} onClick={onDismissError}>×</ActionIcon></Group></Paper>}
    <Paper withBorder radius="md" p="xl" className="upload-dropzone" role="button" tabIndex={0} aria-label={t('Choose an XLSX workbook')} onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.current?.click(); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onSelectFile(event.dataTransfer.files[0] || null); }}>
      <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => onSelectFile(event.target.files?.[0] || null)} />
      <Stack align="center" gap="sm"><ThemeIcon size={52} radius="xl" color="teal" variant="light"><CloudUpload size={25} /></ThemeIcon><Box ta="center"><Text fw={600}>{t('Drop your workbook here')}</Text><Text c="dimmed" size="sm">{t('or click to browse from your computer')}</Text></Box>{file ? <Group gap="xs"><CheckCircle2 size={17} color="var(--mantine-color-teal-6)" /><Text size="sm" fw={500}>{file.name}</Text><Text size="xs" c="dimmed">{formatFileSize(file.size)}</Text></Group> : <Button variant="light" size="sm" leftSection={<FileSpreadsheet size={16} />}>{t('Browse files')}</Button>}</Stack>
    </Paper>
    {file && <Group justify="flex-end"><Button onClick={onUpload} loading={busy} leftSection={<CloudUpload size={16} />}>{t('Upload workbook')}</Button></Group>}
    <Group justify="space-between"><Box><Text component="h2" fz="h2" fw={700}>{t('Recent translations')}</Text><Text size="sm" c="dimmed">{t('Check progress and download completed files.')}</Text></Box><Button variant="default" size="xs" onClick={onRefresh} loading={jobsLoading}>{t('Refresh')}</Button></Group>
    {jobsLoading ? <LoadingJobs /> : <JobList jobs={jobs} busy={busy} onStart={onStart} onRetry={onRetry} onCancel={onCancel} onDownload={onDownload} onConfigure={onConfigure} />}
  </Stack>;
}
