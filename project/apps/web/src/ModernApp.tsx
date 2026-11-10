import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon, AppShell, Avatar, Badge, Box, Breadcrumbs, Burger, Button, Center, Divider, Group,
  Modal, MultiSelect, NavLink, Paper, Progress, ScrollArea, Select, Skeleton, Stack, Text, ThemeIcon, Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  Bell, BookOpen, CheckCircle2, ChevronRight, CloudUpload, FileSpreadsheet, FolderClock,
  History, Languages, LayoutDashboard, LogOut, Moon, Settings, Sun, UserRound, Volume2,
} from 'lucide-react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import ApiService, { Job } from './api';
import NotificationsPage from './NotificationsPage';
import './ModernApp.css';

type View = 'workspace' | 'history' | 'vocabulary' | 'notifications' | 'changelog' | 'profile';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function JobBadge({ status }: { status: Job['status'] }) {
  const color = status === 'COMPLETED' ? 'teal' : status === 'PROCESSING' ? 'blue' : status === 'PENDING' ? 'yellow' : 'red';
  return <Badge color={color} variant="light" size="sm">{status.toLowerCase()}</Badge>;
}

function LoadingJobs() {
  return <Stack gap="sm">{[1, 2, 3].map((item) => <Paper key={item} withBorder p="md" radius="md"><Group wrap="nowrap"><Skeleton circle height={38} /><Box style={{ flex: 1 }}><Skeleton height={14} width="45%" /><Skeleton height={11} mt={8} width="28%" /></Box><Skeleton height={28} width={76} /></Group></Paper>)}</Stack>;
}

function JobList({ jobs, busy, onStart, onRetry, onCancel, onDownload, onConfigure }: {
  jobs: Job[]; busy: boolean; onStart: (id: string) => void; onRetry: (id: string) => void;
  onCancel: (id: string) => void; onDownload: (job: Job) => void; onConfigure: (job: Job) => void;
}) {
  if (!jobs.length) return <Paper withBorder radius="md" p="xl"><Center><Stack align="center" gap="xs"><ThemeIcon size={46} variant="light" color="gray"><FolderClock size={23} /></ThemeIcon><Text fw={600}>No translations yet</Text><Text c="dimmed" size="sm" ta="center">Upload a workbook to start its translation.</Text></Stack></Center></Paper>;

  return <Stack gap="sm">{jobs.map((job) => <Paper key={job.id} withBorder radius="md" p="md" className="job-card">
    <Group align="center" wrap="nowrap">
      <ThemeIcon variant="light" color="teal" size={40} radius="md"><FileSpreadsheet size={21} /></ThemeIcon>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap"><Text fw={600} size="sm" truncate>{job.fileName}</Text><JobBadge status={job.status} /></Group>
        <Text c="dimmed" size="xs" mt={4}>Added {new Date(job.createdAt).toLocaleString()} {job.textCount !== undefined ? `· ${job.textCount} text items` : ''}</Text>
        {job.error && <Text c="red" size="xs" mt={6}>{job.error}</Text>}
        {(job.status === 'PROCESSING' || job.status === 'COMPLETED') && <Progress value={job.progress} mt="sm" size="sm" radius="xl" aria-label={`Translation progress: ${job.progress}%`} />}
      </Box>
      <Box className="job-action">{job.status === 'PENDING' && <><Button size="xs" variant="default" onClick={() => onConfigure(job)}>Settings</Button><Button size="xs" loading={busy} onClick={() => onStart(job.id)}>Start</Button></>}
        {job.status === 'PROCESSING' && <Button size="xs" variant="default" loading={busy} onClick={() => onCancel(job.id)}>Cancel</Button>}
        {job.status === 'FAILED' && <Button size="xs" loading={busy} onClick={() => onRetry(job.id)}>Retry</Button>}
        {job.status === 'COMPLETED' && <Button size="xs" variant="light" onClick={() => onDownload(job)}>Download</Button>}</Box>
    </Group>
  </Paper>)}</Stack>;
}

function PlaceholderPage({ view }: { view: Exclude<View, 'workspace'> }) {
  const descriptions: Record<Exclude<View, 'workspace'>, string> = {
    history: 'Searchable completed-workbook history and spreadsheet previews are the next data slice.',
    vocabulary: 'Create controlled translation terms and assign them to each language pair.',
    notifications: 'Translation status updates and the notification feed will appear here.',
    changelog: 'Product updates and release notes will be published here.',
    profile: 'Profile fields and identity provider details will appear here.',
  };
  const titles: Record<Exclude<View, 'workspace'>, string> = { history: 'Translation history', vocabulary: 'Vocabulary', notifications: 'Notifications', changelog: 'Changelog', profile: 'Profile' };
  return <Stack gap="lg"><Breadcrumbs separator={<ChevronRight size={14} />}>{[<Text key="home" size="sm" c="dimmed">Workspace</Text>, <Text key="current" size="sm">{titles[view]}</Text>]}</Breadcrumbs><Paper withBorder radius="md" p="xl"><Stack align="center" gap="sm"><ThemeIcon size={52} radius="xl" variant="light" color="teal"><BookOpen size={25} /></ThemeIcon><Text fz="h2" fw={700}>{titles[view]}</Text><Text c="dimmed" ta="center" maw={420}>{descriptions[view]}</Text></Stack></Paper></Stack>;
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(username, password); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed.'); } finally { setBusy(false); }
  };
  return <Center mih="100vh" p="md" className="login-page"><Paper component="form" onSubmit={submit} withBorder shadow="sm" radius="md" p="xl" w="100%" maw={400}>
    <Stack gap="md"><ThemeIcon size={44} radius="md" color="teal"><Languages size={23} /></ThemeIcon><Box><Text fz="h2" fw={700}>Welcome back</Text><Text c="dimmed" size="sm">Sign in to manage workbook translations.</Text></Box>
      <label className="field-label">Username<input value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" required /></label>
      <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" required /></label>
      {error && <Text c="red" size="sm" role="alert">{error}</Text>}<Button type="submit" loading={busy} fullWidth>Sign in</Button><Text c="dimmed" size="xs" ta="center">Local development account: user / password</Text>
    </Stack>
  </Paper></Center>;
}

export default function ModernApp() {
  const [token, setToken] = useState(() => localStorage.getItem('excel-translator-token') || '');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<View>('workspace');
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsJob, setSettingsJob] = useState<Job | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [mobileNavigationOpen, { toggle: toggleMobileNavigation, close: closeMobileNavigation }] = useDisclosure(false);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const refresh = useCallback(async () => {
    if (!token) return;
    setJobsLoading(true);
    try { setJobs(await ApiService.getJobs(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load jobs.'); }
    finally { setJobsLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === 'PROCESSING')) return;
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); } finally { setBusy(false); }
  };
  const selectFile = (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.xlsx')) { setError('Select an .xlsx workbook.'); return; }
    if (nextFile.size > MAX_FILE_SIZE) { setError('Files must be 50 MB or smaller.'); return; }
    setError(''); setFile(nextFile);
  };
  const upload = () => { if (file) void run(async () => { await ApiService.uploadFile(file, token); setFile(null); if (fileInput.current) fileInput.current.value = ''; }); };
  const download = (job: Job) => void fetch(ApiService.downloadUrl(job.id), { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
    if (!response.ok) throw new Error('Download failed.'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${job.fileName.replace(/\.xlsx$/i, '')}-translated.xlsx`; link.click(); URL.revokeObjectURL(url);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Download failed.'));
  const openSettings = async (job: Job) => {
    setSettingsBusy(true); setSettingsError('');
    try { setSettingsJob(await ApiService.getJob(job.id, token)); }
    catch (reason) { setSettingsError(reason instanceof Error ? reason.message : 'Could not load workbook settings.'); }
    finally { setSettingsBusy(false); }
  };
  const saveSettings = async () => {
    if (!settingsJob) return;
    setSettingsBusy(true); setSettingsError('');
    try { await ApiService.updateJobSettings(settingsJob.id, settingsJob, token); setSettingsJob(null); await refresh(); }
    catch (reason) { setSettingsError(reason instanceof Error ? reason.message : 'Could not save workbook settings.'); }
    finally { setSettingsBusy(false); }
  };
  const login = async (username: string, password: string) => { const result = await ApiService.login(username, password); localStorage.setItem('excel-translator-token', result.access_token); setToken(result.access_token); };
  const logout = () => { localStorage.removeItem('excel-translator-token'); setToken(''); setJobs([]); setError(''); };

  if (!token) return <LoginScreen onLogin={login} />;
  const navItems: { view: View; label: string; icon: LucideIcon }[] = [
    { view: 'workspace', label: 'Workspace', icon: LayoutDashboard }, { view: 'history', label: 'History', icon: History },
    { view: 'vocabulary', label: 'Vocabulary', icon: BookOpen }, { view: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return <AppShell header={{ height: 64 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !mobileNavigationOpen } }} padding="md">
    <AppShell.Header><Group h="100%" px="lg" justify="space-between"><Group gap="sm"><Burger hiddenFrom="sm" opened={mobileNavigationOpen} onClick={toggleMobileNavigation} aria-label="Toggle navigation" size="sm" /><ThemeIcon size={34} radius="md" color="teal"><Languages size={19} /></ThemeIcon><Box><Text fw={700}>Sheetling</Text><Text size="xs" c="dimmed">Workbook translation</Text></Box></Group><Group gap="xs"><Tooltip label="Notifications"><ActionIcon variant="subtle" color="gray" aria-label="Open notifications" onClick={() => { setView('notifications'); closeMobileNavigation(); }}><Bell size={18} /></ActionIcon></Tooltip><Tooltip label={colorScheme === 'dark' ? 'Use light theme' : 'Use dark theme'}><ActionIcon variant="subtle" color="gray" aria-label="Toggle color theme" onClick={() => toggleColorScheme()}>{colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</ActionIcon></Tooltip><Avatar color="teal" radius="xl" size="sm">U</Avatar></Group></Group>{jobsLoading && <Progress className="top-loader" size={2} value={100} animated />}</AppShell.Header>
    <AppShell.Navbar p="sm"><AppShell.Section><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">Translation</Text>{navItems.map((item) => { const Icon = item.icon; return <NavLink key={item.view} active={view === item.view} label={item.label} leftSection={<Icon size={17} />} onClick={() => { setView(item.view); closeMobileNavigation(); }} />; })}</AppShell.Section><AppShell.Section grow component={ScrollArea} mt="md"><Divider mb="sm" /><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">Account</Text><NavLink label="Profile" leftSection={<UserRound size={17} />} active={view === 'profile'} onClick={() => { setView('profile'); closeMobileNavigation(); }} /><NavLink label="Changelog" leftSection={<Volume2 size={17} />} active={view === 'changelog'} onClick={() => { setView('changelog'); closeMobileNavigation(); }} /></AppShell.Section><AppShell.Section><Divider mb="sm" /><NavLink label="Settings" leftSection={<Settings size={17} />} onClick={() => setHelpOpen(true)} /><NavLink label="Sign out" leftSection={<LogOut size={17} />} onClick={logout} /></AppShell.Section></AppShell.Navbar>
    <AppShell.Main><Box className="main-content">{view === 'workspace' ? <Stack gap="xl"><Breadcrumbs separator={<ChevronRight size={14} />}><Text size="sm">Workspace</Text></Breadcrumbs><Group justify="space-between" align="end"><Box><Text fz="h1" fw={700}>Translate a workbook</Text><Text c="dimmed" mt={4}>Upload an XLSX file and keep track of every translation.</Text></Box><Badge variant="light" color="teal" size="lg">XLSX · up to 50 MB</Badge></Group>
        {error && <Paper withBorder radius="md" p="sm" bg="red.0"><Group justify="space-between"><Text c="red" size="sm" role="alert">{error}</Text><ActionIcon variant="subtle" color="red" aria-label="Dismiss error" onClick={() => setError('')}>×</ActionIcon></Group></Paper>}
        <Paper withBorder radius="md" p="xl" className="upload-dropzone" role="button" tabIndex={0} aria-label="Choose an XLSX workbook" onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.current?.click(); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0] || null); }}>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => selectFile(event.target.files?.[0] || null)} />
          <Stack align="center" gap="sm"><ThemeIcon size={52} radius="xl" color="teal" variant="light"><CloudUpload size={25} /></ThemeIcon><Box ta="center"><Text fw={600}>Drop your workbook here</Text><Text c="dimmed" size="sm">or click to browse from your computer</Text></Box>{file ? <Group gap="xs"><CheckCircle2 size={17} color="var(--mantine-color-teal-6)" /><Text size="sm" fw={500}>{file.name}</Text><Text size="xs" c="dimmed">{formatFileSize(file.size)}</Text></Group> : <Button variant="light" size="sm" leftSection={<FileSpreadsheet size={16} />}>Browse files</Button>}</Stack>
        </Paper>
        {file && <Group justify="flex-end"><Button onClick={upload} loading={busy} leftSection={<CloudUpload size={16} />}>Upload workbook</Button></Group>}
        <Group justify="space-between"><Box><Text fz="h2" fw={700}>Recent translations</Text><Text size="sm" c="dimmed">Check progress and download completed files.</Text></Box><Button variant="default" size="xs" onClick={() => void refresh()} loading={jobsLoading}>Refresh</Button></Group>{jobsLoading ? <LoadingJobs /> : <JobList jobs={jobs} busy={busy} onStart={(id) => void run(() => ApiService.startTranslation(id, token))} onRetry={(id) => void run(() => ApiService.retryJob(id, token))} onCancel={(id) => void run(() => ApiService.cancelJob(id, token))} onDownload={download} onConfigure={(job) => void openSettings(job)} />}
      </Stack> : view === 'notifications' ? <NotificationsPage token={token} /> : <PlaceholderPage view={view} />}
      <footer className="app-footer"><Text size="xs" c="dimmed">Sheetling keeps workbook text private to your session.</Text></footer></Box>
    </AppShell.Main>
    <Modal opened={helpOpen} onClose={() => setHelpOpen(false)} title="Settings" centered><Text size="sm" c="dimmed">Language, identity, and service settings will be connected as the persistent platform modules are delivered.</Text></Modal>
    <Modal opened={Boolean(settingsJob)} onClose={() => setSettingsJob(null)} title="Translation settings" centered>
      {settingsJob && <Stack gap="md">
        <Text size="sm" c="dimmed">Choose worksheets and languages before starting this job.</Text>
        <MultiSelect label="Worksheets" data={settingsJob.availableSheets} value={settingsJob.selectedSheets} onChange={(selectedSheets) => setSettingsJob({ ...settingsJob, selectedSheets })} searchable clearable={false} />
        <Select label="Source language" data={[{ value: 'JAPANESE', label: 'Japanese' }, { value: 'ENGLISH', label: 'English' }, { value: 'CHINESE', label: 'Chinese' }]} value={settingsJob.sourceLanguage} onChange={(value) => value && setSettingsJob({ ...settingsJob, sourceLanguage: value as Job['sourceLanguage'] })} />
        <Select label="Target language" data={[{ value: 'ENGLISH', label: 'English' }, { value: 'JAPANESE', label: 'Japanese' }, { value: 'CHINESE', label: 'Chinese' }]} value={settingsJob.targetLanguage} onChange={(value) => value && setSettingsJob({ ...settingsJob, targetLanguage: value as Job['targetLanguage'] })} />
        {settingsError && <Text c="red" size="sm" role="alert">{settingsError}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => setSettingsJob(null)}>Cancel</Button><Button onClick={() => void saveSettings()} loading={settingsBusy}>Save settings</Button></Group>
      </Stack>}
    </Modal>
  </AppShell>;
}
