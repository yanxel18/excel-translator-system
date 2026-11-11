import { useEffect, useRef, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import Keycloak from 'keycloak-js';
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
import DashboardPage from './features/dashboard/DashboardPage';
import { Alert } from '@mantine/core';
import { useWorkspaceController } from './features/workspace/useWorkspaceController';
import { useLocale } from './features/shared/LocaleProvider';
import './ModernApp.css';

export default function ModernApp() {
  const [token, setToken] = useState(() => localStorage.getItem('excel-translator-token') || '');
  const [selectedNotificationId, setSelectedNotificationId] = useState<string>();
  const [view, setView] = useState<View>('workspace');
  const [settingsOpen, { open: openSettingsDialog, close: closeSettingsDialog }] = useDisclosure(false);
  const [settingsJob, setSettingsJob] = useState<Job | null>(null);
  const [vocabularyGroups, setVocabularyGroups] = useState<VocabularyGroup[]>([]);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [mobileNavigationOpen, { toggle: toggleMobileNavigation, close: closeMobileNavigation }] = useDisclosure(false);
  const [oidcBusy, setOidcBusy] = useState(false);
  const [oidcError, setOidcError] = useState('');
  const [oidcConfig, setOidcConfig] = useState<{ enabled: boolean; url: string; realm: string; clientId: string } | null>(null);
  const keycloakRef = useRef<Keycloak | null>(null);
  const { t } = useLocale();
  const workspace = useWorkspaceController(token, t);

  useEffect(() => {
    if (token) return;
    let active = true;
    void ApiService.getOidcConfig()
      .then((config) => { if (active) { setOidcConfig(config); setOidcError(''); } })
      .catch((reason) => { if (active) setOidcError(reason instanceof Error ? reason.message : 'Could not load sign-in configuration.'); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!oidcConfig?.enabled || token) return;
    const { url, realm, clientId } = oidcConfig;
    if (!url || !realm || !clientId) {
      setOidcError('Keycloak is enabled but its URL, realm, or client ID is missing.');
      return;
    }
    let active = true;
    const keycloak = new Keycloak({
      url,
      realm,
      clientId,
    });
    keycloakRef.current = keycloak;
    void keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false })
      .then(async (authenticated) => {
        if (!active || !authenticated || !keycloak.token) return;
        setOidcBusy(true);
        const result = await ApiService.exchangeKeycloakToken(keycloak.token);
        if (active) {
          localStorage.setItem('excel-translator-token', result.access_token);
          setToken(result.access_token);
        }
      })
      .catch((reason) => { if (active) setOidcError(reason instanceof Error ? reason.message : 'Keycloak sign-in failed.'); })
      .finally(() => { if (active) setOidcBusy(false); });
    return () => { active = false; };
  }, [oidcConfig, token]);

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

  const loginWithKeycloak = async () => {
    setOidcError('');
    setOidcBusy(true);
    try {
      const keycloak = keycloakRef.current;
      if (!keycloak) throw new Error('Keycloak is not ready.');
      await keycloak.login({ redirectUri: window.location.href });
    } catch (reason) {
      setOidcError(reason instanceof Error ? reason.message : 'Keycloak sign-in failed.');
      setOidcBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('excel-translator-token');
    workspace.reset();
    setOidcConfig(null);
    setToken('');
  };

  if (!token) return <LoginScreen onLogin={login} onKeycloakLogin={oidcConfig?.enabled ? loginWithKeycloak : undefined} oidcBusy={oidcBusy} oidcError={oidcError} />;

  const compatibleVocabularyGroups = settingsJob
    ? vocabularyGroups.filter((group) => group.sourceLanguage === settingsJob.sourceLanguage && group.targetLanguage === settingsJob.targetLanguage)
    : [];
  const settingsValid = Boolean(settingsJob?.selectedSheets.length && settingsJob.sourceLanguage !== settingsJob.targetLanguage
    && (!settingsJob.vocabularyGroupId || compatibleVocabularyGroups.some((group) => group.id === settingsJob.vocabularyGroupId)));

  return <AppFrame onOpenNotification={(id) => { setSelectedNotificationId(id); setView('notifications'); }} token={token} view={view} onNavigate={setView} onSignOut={logout} mobileOpen={mobileNavigationOpen}
    onToggleMobile={toggleMobileNavigation} onCloseMobile={closeMobileNavigation}
    settingsOpen={settingsOpen} onSettingsOpen={openSettingsDialog} onSettingsClose={closeSettingsDialog}>
    {settingsError && !settingsJob && <Alert color="red" withCloseButton onClose={() => setSettingsError('')} mb="md">{settingsError}</Alert>}
    {view === 'dashboard' ? <DashboardPage jobs={workspace.jobs} loading={workspace.jobsLoading} onWorkspace={() => setView('workspace')} onHistory={() => setView('history')} /> : view === 'workspace' ? <WorkspacePage
      file={workspace.file} fileInput={workspace.fileInput} error={workspace.error} busy={workspace.busy} jobs={workspace.jobs} jobsLoading={workspace.jobsLoading} token={token}
      onDismissError={workspace.dismissError} onSelectFile={workspace.selectFile} onUpload={workspace.upload} onRefresh={() => void workspace.refresh()} onHistory={() => setView('history')}
      onStart={(job) => void openJobSettings(job)} onRetry={(id) => void workspace.run(() => ApiService.retryJob(id, token))}
      onCancel={(id) => void workspace.run(() => ApiService.cancelJob(id, token))} onDownload={workspace.download} onConfigure={(job) => void openJobSettings(job)}
    /> : view === 'notifications' ? <NotificationsPage token={token} selectedId={selectedNotificationId} /> : view === 'vocabulary' ? <VocabularyPage token={token} /> : view === 'history' ? <HistoryPage token={token} /> : view === 'profile' ? <ProfilePage token={token} /> : <ChangelogPage token={token} />}
    <TranslationSettingsModal job={settingsJob} vocabularyGroups={vocabularyGroups} busy={settingsBusy} error={settingsError} valid={settingsValid} onClose={() => setSettingsJob(null)} onJobChange={setSettingsJob} onSave={(startAfterSave) => void saveSettings(startAfterSave)} />
  </AppFrame>;
}
