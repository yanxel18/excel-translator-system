import { Badge, Box, Button, Center, Group, Paper, Progress, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { FileSpreadsheet, FolderClock } from 'lucide-react';
import { Job } from '../../api';

export function LoadingJobs() {
  return <Stack gap="sm">{[1, 2, 3].map((item) => <Paper key={item} withBorder p="md" radius="md">
    <Group wrap="nowrap"><Skeleton circle height={38} /><Box style={{ flex: 1 }}><Skeleton height={14} width="45%" /><Skeleton height={11} mt={8} width="28%" /></Box><Skeleton height={28} width={76} /></Group>
  </Paper>)}</Stack>;
}

export interface JobListProps {
  jobs: Job[];
  busy: boolean;
  onStart: (job: Job) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDownload: (job: Job) => void;
  onConfigure: (job: Job) => void;
}

function JobBadge({ status }: { status: Job['status'] }) {
  const color = status === 'COMPLETED' ? 'teal' : status === 'PROCESSING' ? 'blue' : status === 'PENDING' ? 'yellow' : 'red';
  return <Badge color={color} variant="light" size="sm">{status.toLowerCase()}</Badge>;
}

export default function JobList({ jobs, busy, onStart, onRetry, onCancel, onDownload, onConfigure }: JobListProps) {
  if (!jobs.length) return <Paper withBorder radius="md" p="xl"><Center><Stack align="center" gap="xs">
    <ThemeIcon size={46} variant="light" color="gray"><FolderClock size={23} /></ThemeIcon>
    <Text fw={600}>No translations yet</Text>
    <Text c="dimmed" size="sm" ta="center">Upload a workbook to start its translation.</Text>
  </Stack></Center></Paper>;

  return <Stack gap="sm">{jobs.map((job) => <Paper key={job.id} withBorder radius="md" p="md" className="job-card">
    <Group align="center" wrap="nowrap">
      <ThemeIcon variant="light" color="teal" size={40} radius="md"><FileSpreadsheet size={21} /></ThemeIcon>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap"><Text fw={600} size="sm" truncate>{job.fileName}</Text><JobBadge status={job.status} /></Group>
        <Text c="dimmed" size="xs" mt={4}>Added {new Date(job.createdAt).toLocaleString()} {job.textCount !== undefined ? ` · ${job.textCount} text items` : ''}</Text>
        {job.error && <Text c="red" size="xs" mt={6} role="alert">{job.error}</Text>}
        {(job.status === 'PROCESSING' || job.status === 'COMPLETED') && <Progress value={job.progress} mt="sm" size="sm" radius="xl" aria-label={`Translation progress: ${job.progress}%`} />}
      </Box>
      <Box className="job-action">{job.status === 'PENDING' && <><Button size="xs" variant="default" onClick={() => onConfigure(job)}>Settings</Button><Button size="xs" loading={busy} onClick={() => onStart(job)}>Start</Button></>}
        {job.status === 'PROCESSING' && <Button size="xs" variant="default" loading={busy} onClick={() => onCancel(job.id)}>Cancel</Button>}
        {job.status === 'FAILED' && <Button size="xs" loading={busy} onClick={() => onRetry(job.id)}>Retry</Button>}
        {job.status === 'COMPLETED' && <Button size="xs" variant="light" onClick={() => onDownload(job)}>Download</Button>}</Box>
    </Group>
  </Paper>)}</Stack>;
}
