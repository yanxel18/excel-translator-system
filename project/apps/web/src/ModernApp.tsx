import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, AppShell, Avatar, Box, Burger, Divider, Group, Modal, NavLink, Progress, ScrollArea, Text, ThemeIcon, Tooltip, useMantineColorScheme } from '@mantine/core';
import { Bell, BookOpen, History, Languages, LayoutDashboard, LogOut, Moon, Settings, Sun, UserRound, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import ApiService, { Job, VocabularyGroup } from './api';
import NotificationsPage from './NotificationsPage';
import LoginScreen from './features/auth/LoginScreen';
import PlaceholderPage from './features/app-shell/PlaceholderPage';
import { View } from './features/app-shell/types';
import VocabularyPage from './features/vocabulary/VocabularyPage';
import TranslationSettingsModal from './features/workspace/TranslationSettingsModal';
import WorkspacePage from './features/workspace/WorkspacePage';
import './ModernApp.css';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
  const [vocabularyGroups, setVocabularyGroups] = useState<VocabularyGroup[]>([]);
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
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const selectFile = (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.xlsx')) { setError('Select an .xlsx workbook.'); return; }
    if (nextFile.size > MAX_FILE_SIZE) { setError('Files must be 50 MB or smaller.'); return; }
    setError(''); setFile(nextFile);
  };

  const upload = () => {
    if (!file) return;
    void run(async () => {
      await ApiService.uploadFile(file, token);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    });
  };

  const download = (job: Job) => void fetch(ApiService.downloadUrl(job.id), { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
    if (!response.ok) throw new Error('Download failed.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${job.fileName.replace(/\.xlsx$/i, '')}-translated.xlsx`;
    link.click(); URL.revokeObjectURL(url);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Download failed.'));

  const openSettings = async (job: Job) => {
    setSettingsBusy(true); setSettingsError('');
    try {
      const [details, groups] = await Promise.all([ApiService.getJob(job.id, token), ApiService.getVocabularyGroups(token)]);
      setVocabularyGroups(groups);
      const compatible = groups.some((group) => group.id === details.vocabularyGroupId && group.sourceLanguage === details.sourceLanguage && group.targetLanguage === details.targetLanguage);
      setSettingsJob({ ...details, vocabularyGroupId: compatible ? details.vocabularyGroupId : null });
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : 'Could not load workbook settings.'); }
    finally { setSettingsBusy(false); }
  };

  const saveSettings = async (startAfterSave = false) => {
    if (!settingsJob) return;
    setSettingsBusy(true); setSettingsError('');
    try {
      await ApiService.updateJobSettings(settingsJob.id, settingsJob, token);
      if (startAfterSave) await ApiService.startTranslation(settingsJob.id, token);
      setSettingsJob(null); await refresh();
    } catch (reason) { setSettingsError(reason instanceof Error ? reason.message : 'Could not save workbook settings.'); }
    finally { setSettingsBusy(false); }
  };

  const login = async (username: string, password: string) => {
    const result = await ApiService.login(username, password);
    localStorage.setItem('excel-translator-token', result.access_token);
    setToken(result.access_token);
  };

  const logout = () => {
    localStorage.removeItem('excel-translator-token');
    setToken(''); setJobs([]); setError('');
  };

  if (!token) return <LoginScreen onLogin={login} />;

  const navItems: { view: View; label: string; icon: LucideIcon }[] = [
    { view: 'workspace', label: 'Workspace', icon: LayoutDashboard },
    { view: 'history', label: 'History', icon: History },
    { view: 'vocabulary', label: 'Vocabulary', icon: BookOpen },
    { view: 'notifications', label: 'Notifications', icon: Bell },
  ];
  const compatibleVocabularyGroups = settingsJob
    ? vocabularyGroups.filter((group) => group.sourceLanguage === settingsJob.sourceLanguage && group.targetLanguage === settingsJob.targetLanguage)
    : [];
  const settingsValid = Boolean(settingsJob?.selectedSheets.length && settingsJob.sourceLanguage !== settingsJob.targetLanguage
    && (!settingsJob.vocabularyGroupId || compatibleVocabularyGroups.some((group) => group.id === settingsJob.vocabularyGroupId)));

  return <AppShell header={{ height: 64 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !mobileNavigationOpen } }} padding="md">
    <AppShell.Header><Group h="100%" px="lg" justify="space-between"><Group gap="sm"><Burger hiddenFrom="sm" opened={mobileNavigationOpen} onClick={toggleMobileNavigation} aria-label="Toggle navigation" size="sm" /><ThemeIcon size={34} radius="md" color="teal"><Languages size={19} /></ThemeIcon><Box><Text fw={700}>Sheetling</Text><Text size="xs" c="dimmed">Workbook translation</Text></Box></Group><Group gap="xs"><Tooltip label="Notifications"><ActionIcon variant="subtle" color="gray" aria-label="Open notifications" onClick={() => { setView('notifications'); closeMobileNavigation(); }}><Bell size={18} /></ActionIcon></Tooltip><Tooltip label={colorScheme === 'dark' ? 'Use light theme' : 'Use dark theme'}><ActionIcon variant="subtle" color="gray" aria-label="Toggle color theme" onClick={() => toggleColorScheme()}>{colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</ActionIcon></Tooltip><Avatar color="teal" radius="xl" size="sm">U</Avatar></Group></Group>{jobsLoading && <Progress className="top-loader" size={2} value={100} animated />}</AppShell.Header>
    <AppShell.Navbar p="sm"><AppShell.Section><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">Translation</Text>{navItems.map((item) => { const Icon = item.icon; return <NavLink key={item.view} active={view === item.view} label={item.label} leftSection={<Icon size={17} />} onClick={() => { setView(item.view); closeMobileNavigation(); }} />; })}</AppShell.Section><AppShell.Section grow component={ScrollArea} mt="md"><Divider mb="sm" /><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">Account</Text><NavLink label="Profile" leftSection={<UserRound size={17} />} active={view === 'profile'} onClick={() => { setView('profile'); closeMobileNavigation(); }} /><NavLink label="Changelog" leftSection={<Volume2 size={17} />} active={view === 'changelog'} onClick={() => { setView('changelog'); closeMobileNavigation(); }} /></AppShell.Section><AppShell.Section><Divider mb="sm" /><NavLink label="Settings" leftSection={<Settings size={17} />} onClick={() => setHelpOpen(true)} /><NavLink label="Sign out" leftSection={<LogOut size={17} />} onClick={logout} /></AppShell.Section></AppShell.Navbar>
    <AppShell.Main><Box className="main-content">
      {view === 'workspace' ? <WorkspacePage
        file={file} fileInput={fileInput} error={error} busy={busy} jobs={jobs} jobsLoading={jobsLoading}
        onDismissError={() => setError('')} onSelectFile={selectFile} onUpload={upload} onRefresh={() => void refresh()}
        onStart={(job) => void openSettings(job)} onRetry={(id) => void run(() => ApiService.retryJob(id, token))}
        onCancel={(id) => void run(() => ApiService.cancelJob(id, token))} onDownload={download} onConfigure={(job) => void openSettings(job)}
      /> : view === 'notifications' ? <NotificationsPage token={token} /> : view === 'vocabulary' ? <VocabularyPage token={token} /> : <PlaceholderPage view={view} />}
      <footer className="app-footer"><Text size="xs" c="dimmed">Sheetling keeps workbook text private to your session.</Text></footer>
    </Box></AppShell.Main>
    <Modal opened={helpOpen} onClose={() => setHelpOpen(false)} title="Settings" centered><Text size="sm" c="dimmed">Language, identity, and service settings will be connected as the persistent platform modules are delivered.</Text></Modal>
    <TranslationSettingsModal job={settingsJob} vocabularyGroups={vocabularyGroups} busy={settingsBusy} error={settingsError} valid={settingsValid} onClose={() => setSettingsJob(null)} onJobChange={setSettingsJob} onSave={(startAfterSave) => void saveSettings(startAfterSave)} />
  </AppShell>;
}
