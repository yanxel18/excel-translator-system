import type { ReactNode } from 'react';
import { AppShell, Box, Text } from '@mantine/core';
import type { View } from './types';
import AppHeader from './AppHeader';
import AppNavigation from './AppNavigation';
import PreferencesModal from './PreferencesModal';
import { useLocale } from '../shared/LocaleProvider';

export default function AppFrame({ view, onNavigate, onSignOut, mobileOpen, onToggleMobile, onCloseMobile, loading, settingsOpen, onSettingsOpen, onSettingsClose, children }: {
  view: View;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  loading: boolean;
  settingsOpen: boolean;
  onSettingsOpen: () => void;
  onSettingsClose: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  return <AppShell header={{ height: 64 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !mobileOpen } }} padding="md">
    <AppShell.Header><AppHeader loading={loading} navigationOpen={mobileOpen} onToggleNavigation={onToggleMobile} onOpenNotifications={() => { onNavigate('notifications'); onCloseMobile(); }} /></AppShell.Header>
    <AppShell.Navbar p="sm"><AppNavigation view={view} onNavigate={(destination) => { onNavigate(destination); onCloseMobile(); }} onSettings={onSettingsOpen} onSignOut={onSignOut} /></AppShell.Navbar>
    <AppShell.Main><Box className="main-content">{children}<footer className="app-footer"><Text size="xs" c="dimmed">{t('Sheetling keeps workbook text private to your session.')}</Text></footer></Box></AppShell.Main>
    <PreferencesModal opened={settingsOpen} onClose={onSettingsClose} />
  </AppShell>;
}
