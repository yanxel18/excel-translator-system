import { Badge, Box, Button, Group, Paper, RingProgress, SimpleGrid, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { Activity, ArrowRight, CheckCircle2, Clock3, FileSpreadsheet, Languages } from 'lucide-react';
import type { Job } from '../../api';
import { useLocale } from '../shared/LocaleProvider';
import LanguagePair from '../shared/LanguagePair';

type Props = { jobs: Job[]; loading: boolean; onWorkspace: () => void; onHistory: () => void };

const labels = {
  en: { dashboard: 'Dashboard', intro: 'A clear view of your workbook activity.', newTranslation: 'New translation', total: 'Total workbooks', complete: 'Completed', active: 'In progress', attention: 'Need attention', activity: 'Activity over the last 7 days', created: 'Workbooks added', breakdown: 'Translation status', recent: 'Recent translations', history: 'View all', empty: 'No workbook activity yet', emptyHelp: 'Upload a workbook to see your activity here.', loading: 'Loading dashboard', pending: 'Pending', processing: 'Processing', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' },
  ja: { dashboard: 'ダッシュボード', intro: 'ワークブックの利用状況を確認できます。', newTranslation: '翻訳を開始', total: 'ワークブック合計', complete: '完了', active: '処理中', attention: '要確認', activity: '過去7日間のアクティビティ', created: '追加されたワークブック', breakdown: '翻訳状況', recent: '最近のワークブック', history: '履歴を見る', empty: 'アクティビティはまだありません', emptyHelp: 'ワークブックをアップロードすると、ここに表示されます。', loading: 'ダッシュボードを読み込み中', pending: '待機中', processing: '処理中', completed: '完了', failed: '失敗', cancelled: 'キャンセル' },
  zh: { dashboard: '仪表板', intro: '查看工作簿翻译活动。', newTranslation: '新建翻译', total: '工作簿总数', complete: '已完成', active: '处理中', attention: '需要关注', activity: '过去 7 天的活动', created: '已添加的工作簿', breakdown: '翻译状态', recent: '最近的工作簿', history: '查看历史', empty: '暂无工作簿活动', emptyHelp: '上传工作簿后，活动将显示在这里。', loading: '正在加载仪表板', pending: '待处理', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消' },
};

export default function DashboardPage({ jobs, loading, onWorkspace, onHistory }: Props) {
  const { locale } = useLocale();
  const l = labels[locale];
  const completed = jobs.filter((job) => job.status === 'COMPLETED').length;
  const processing = jobs.filter((job) => job.status === 'PROCESSING').length;
  const failed = jobs.filter((job) => job.status === 'FAILED').length;
  const statusRows = [
    { label: l.completed, count: completed, color: 'teal' },
    { label: l.processing, count: processing, color: 'blue' },
    { label: l.pending, count: jobs.filter((job) => job.status === 'PENDING').length, color: 'yellow' },
    { label: l.failed, count: failed, color: 'red' },
    { label: l.cancelled, count: jobs.filter((job) => job.status === 'CANCELLED').length, color: 'gray' },
  ];
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - index));
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { date: start, count: jobs.filter((job) => { const created = new Date(job.createdAt); return created >= start && created < end; }).length };
  });
  const max = Math.max(1, ...days.map((day) => day.count));
  const sortedJobs = [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const recent = sortedJobs.slice(0, 10);
  const cards = [
    { label: l.total, value: jobs.length, icon: FileSpreadsheet, color: 'blue' },
    { label: l.complete, value: completed, icon: CheckCircle2, color: 'teal' },
    { label: l.active, value: processing, icon: Activity, color: 'indigo' },
    { label: l.attention, value: failed, icon: Clock3, color: 'orange' },
  ];

  return <Stack gap="lg" className="dashboard-page">
    <Group justify="space-between" align="end"><Box><Text size="sm" c="blue" fw={700} tt="uppercase">{l.dashboard}</Text><Text component="h1" fz={26} fw={600}>{l.dashboard}</Text><Text size="sm" c="dimmed">{l.intro}</Text></Box><Button leftSection={<Languages size={17} />} onClick={onWorkspace}>{l.newTranslation}</Button></Group>
    {loading ? <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} aria-label={l.loading} aria-busy="true">{cards.map((card) => <Skeleton key={card.label} height={130} radius="lg" />)}</SimpleGrid> : <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }}>{cards.map(({ label, value, icon: Icon, color }) => <Paper key={label} withBorder radius="lg" p="lg" shadow="xs"><Group justify="space-between" align="start"><Text size="sm" c="dimmed" fw={600}>{label}</Text><ThemeIcon variant="light" color={color} radius="md" size="lg"><Icon size={19} /></ThemeIcon></Group><Text fz={28} fw={750} mt="md">{value.toLocaleString(locale)}</Text></Paper>)}</SimpleGrid>}
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Paper withBorder radius="lg" p="lg" shadow="xs"><Text fw={700} size="sm">{l.activity}</Text><Text size="sm" c="dimmed">{l.created}</Text><Group align="end" justify="space-between" gap="xs" mt="xl" style={{ height: 145 }} role="img" aria-label={`${l.activity}: ${days.map((day) => `${day.date.toLocaleDateString(locale)} ${day.count}`).join(', ')}`}>
        {days.map((day) => <Stack key={day.date.toISOString()} align="center" justify="end" gap={5} style={{ flex: 1, height: '100%' }}><Text size="xs" c="dimmed">{day.count}</Text><Box style={{ width: 'min(100%, 34px)', height: `${Math.max(4, day.count / max * 95)}px`, borderRadius: '8px 8px 3px 3px', background: day.count ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)' }} /><Text size="xs" c="dimmed">{day.date.toLocaleDateString(locale, { weekday: 'short' })}</Text></Stack>)}
      </Group></Paper>
      <Paper withBorder radius="lg" p="lg" shadow="xs"><Text fw={700} size="sm">{l.breakdown}</Text><Group justify="center" gap="xl" mt="md"><RingProgress size={170} thickness={18} roundCaps sections={statusRows.filter((row) => row.count > 0).map((row) => ({ value: jobs.length ? row.count / jobs.length * 100 : 0, color: row.color, tooltip: `${row.label}: ${row.count}` }))} label={<Box ta="center"><Text fz={27} fw={600}>{jobs.length}</Text><Text size="xs" c="dimmed">{l.total}</Text></Box>} /><Stack gap="sm">{statusRows.map((row) => <Group key={row.label} gap="xs"><Box w={7} h={7} bg={row.color} style={{ borderRadius: '50%' }} /><Text size="xs" c="dimmed">{row.label}</Text><Text size="xs" fw={600}>{row.count}</Text></Group>)}</Stack></Group></Paper>
    </SimpleGrid>
    <Paper withBorder radius="lg" p="lg" shadow="xs"><Group justify="space-between" mb="md"><Text fw={700} size="sm">{l.recent}</Text><Button variant="subtle" rightSection={<ArrowRight size={16} />} onClick={onHistory}>{l.history}</Button></Group>{recent.length ? <Stack gap="xs">{recent.map((job) => <Group key={job.id} justify="space-between" wrap="nowrap" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}><Group wrap="nowrap" style={{ minWidth: 0 }}><ThemeIcon variant="light" color="blue" size="lg"><FileSpreadsheet size={18} /></ThemeIcon><Box style={{ minWidth: 0 }}><Text fw={600} size="sm" truncate>{job.fileName}</Text><Text size="xs" c="dimmed">{new Date(job.createdAt).toLocaleDateString(locale)}</Text><LanguagePair source={job.sourceLanguage} target={job.targetLanguage} /></Box></Group><Badge variant="light" color={job.status === 'COMPLETED' ? 'teal' : job.status === 'FAILED' ? 'red' : 'blue'}>{l[job.status.toLowerCase() as keyof typeof l]}</Badge></Group>)}</Stack> : <Box py="xl" ta="center"><Text fw={600}>{l.empty}</Text><Text size="sm" c="dimmed" mt={4}>{l.emptyHelp}</Text></Box>}</Paper>
  </Stack>;
}
