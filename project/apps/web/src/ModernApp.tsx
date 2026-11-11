import { useState } from 'react';
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
import { useWorkspaceController } from './features/workspace/useWorkspaceController';
import { useLocale } from './features/shared/LocaleProvider';
import './ModernApp.css';

export default function ModernApp() {
  const [token, setToken] = useState(() => localStorage.getItem('excel-translator-token') || '');
  const [view, setView] = useState<View>('workspace');
  const [settingsOpen, { open: openSettingsDialog, close: closeSettingsDialog }] = useDisclosure(false);
  const [settingsJob, setSettingsJob] = useState<Job | null>(null);
  const [vocabularyGroups, setVocabularyGroups] = useState<VocabularyGroup[]>([]);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [mobileNavigationOpen, { toggle: toggleMobileNavigation, close: closeMobileNavigation }] = useDisclosure(false);
  const { t } = useLocale();
  const workspace = useWorkspaceController(token, t);

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
      setSettingsJob(null); await workspace.refresh();
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
    workspace.reset();
    setToken('');
  };

  if (!token) return <LoginScreen onLogin={login} />;

  const compatibleVocabularyGroups = settingsJob
    ? vocabularyGroups.filter((group) => group.sourceLanguage === settingsJob.sourceLanguage && group.targetLanguage === settingsJob.targetLanguage)
    : [];
  const settingsValid = Boolean(settingsJob?.selectedSheets.length && settingsJob.sourceLanguage !== settingsJob.targetLanguage
    && (!settingsJob.vocabularyGroupId || compatibleVocabularyGroups.some((group) => group.id === settingsJob.vocabularyGroupId)));

  return <AppFrame view={view} onNavigate={setView} onSignOut={logout} mobileOpen={mobileNavigationOpen}
    onToggleMobile={toggleMobileNavigation} onCloseMobile={closeMobileNavigation} loading={workspace.jobsLoading}
    settingsOpen={settingsOpen} onSettingsOpen={openSettingsDialog} onSettingsClose={closeSettingsDialog}>
    {view === 'workspace' ? <WorkspacePage
      file={workspace.file} fileInput={workspace.fileInput} error={workspace.error} busy={workspace.busy} jobs={workspace.jobs} jobsLoading={workspace.jobsLoading}
      onDismissError={workspace.dismissError} onSelectFile={workspace.selectFile} onUpload={workspace.upload} onRefresh={() => void workspace.refresh()}
      onStart={(job) => void openJobSettings(job)} onRetry={(id) => void workspace.run(() => ApiService.retryJob(id, token))}
      onCancel={(id) => void workspace.run(() => ApiService.cancelJob(id, token))} onDownload={workspace.download} onConfigure={(job) => void openJobSettings(job)}
    /> : view === 'notifications' ? <NotificationsPage token={token} /> : view === 'vocabulary' ? <VocabularyPage token={token} /> : view === 'history' ? <HistoryPage token={token} /> : view === 'profile' ? <ProfilePage token={token} /> : <ChangelogPage token={token} />}
    <TranslationSettingsModal job={settingsJob} vocabularyGroups={vocabularyGroups} busy={settingsBusy} error={settingsError} valid={settingsValid} onClose={() => setSettingsJob(null)} onJobChange={setSettingsJob} onSave={(startAfterSave) => void saveSettings(startAfterSave)} />
  </AppFrame>;
}
