import { useCallback, useEffect, useRef, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import ApiService, { type Job, type VocabularyGroup } from './api';
import NotificationsPage from './features/notifications/NotificationsPage';
import LoginScreen from './features/auth/LoginScreen';
import type { View } from './features/app-shell/types';
import AppFrame from './features/app-shell/AppFrame';
import VocabularyPage from './features/vocabulary/VocabularyPage';
import HistoryPage from './features/history/HistoryPage';
import ProfilePage from './features/profile/ProfilePage';
import ChangelogPage from './features/changelog/ChangelogPage';
import TranslationSettingsModal from './features/workspace/TranslationSettingsModal';
import WorkspacePage from './features/workspace/WorkspacePage';
import { useLocale } from './features/shared/LocaleProvider';
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
  const [settingsOpen, { open: openSettingsDialog, close: closeSettingsDialog }] = useDisclosure(false);
  const [settingsJob, setSettingsJob] = useState<Job | null>(null);
  const [vocabularyGroups, setVocabularyGroups] = useState<VocabularyGroup[]>([]);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [mobileNavigationOpen, { toggle: toggleMobileNavigation, close: closeMobileNavigation }] = useDisclosure(false);
  const { t } = useLocale();

  const refresh = useCallback(async () => {
    if (!token) return;
    setJobsLoading(true);
    try { setJobs(await ApiService.getJobs(token)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('Could not load jobs.')); }
    finally { setJobsLoading(false); }
  }, [token, t]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === 'PROCESSING')) return;
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('Something went wrong.')); }
    finally { setBusy(false); }
  };

  const selectFile = (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith('.xlsx')) { setError(t('Select an .xlsx workbook.')); return; }
    if (nextFile.size > MAX_FILE_SIZE) { setError(t('Files must be 50 MB or smaller.')); return; }
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

  const openJobSettings = async (job: Job) => {
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

  const compatibleVocabularyGroups = settingsJob
    ? vocabularyGroups.filter((group) => group.sourceLanguage === settingsJob.sourceLanguage && group.targetLanguage === settingsJob.targetLanguage)
    : [];
  const settingsValid = Boolean(settingsJob?.selectedSheets.length && settingsJob.sourceLanguage !== settingsJob.targetLanguage
    && (!settingsJob.vocabularyGroupId || compatibleVocabularyGroups.some((group) => group.id === settingsJob.vocabularyGroupId)));

  return <AppFrame view={view} onNavigate={setView} onSignOut={logout} mobileOpen={mobileNavigationOpen}
    onToggleMobile={toggleMobileNavigation} onCloseMobile={closeMobileNavigation} loading={jobsLoading}
    settingsOpen={settingsOpen} onSettingsOpen={openSettingsDialog} onSettingsClose={closeSettingsDialog}>
    {view === 'workspace' ? <WorkspacePage
      file={file} fileInput={fileInput} error={error} busy={busy} jobs={jobs} jobsLoading={jobsLoading}
      onDismissError={() => setError('')} onSelectFile={selectFile} onUpload={upload} onRefresh={() => void refresh()}
      onStart={(job) => void openJobSettings(job)} onRetry={(id) => void run(() => ApiService.retryJob(id, token))}
      onCancel={(id) => void run(() => ApiService.cancelJob(id, token))} onDownload={download} onConfigure={(job) => void openJobSettings(job)}
    /> : view === 'notifications' ? <NotificationsPage token={token} /> : view === 'vocabulary' ? <VocabularyPage token={token} /> : view === 'history' ? <HistoryPage token={token} /> : view === 'profile' ? <ProfilePage token={token} /> : <ChangelogPage token={token} />}
    <TranslationSettingsModal job={settingsJob} vocabularyGroups={vocabularyGroups} busy={settingsBusy} error={settingsError} valid={settingsValid} onClose={() => setSettingsJob(null)} onJobChange={setSettingsJob} onSave={(startAfterSave) => void saveSettings(startAfterSave)} />
  </AppFrame>;
}
