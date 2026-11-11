import type { ReactNode } from 'react';
import { AppShell, Box } from '@mantine/core';
import type { View } from './types';
import AppHeader from './AppHeader';
import AppNavigation from './AppNavigation';
import PreferencesModal from './PreferencesModal';

export default function AppFrame({ view, onNavigate, onSignOut, mobileOpen, onToggleMobile, onCloseMobile, settingsOpen, onSettingsOpen, onSettingsClose, children, token, onOpenNotification }: {
  onOpenNotification: (id?: string) => void;
  token: string;
  view: View;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  settingsOpen: boolean;
  onSettingsOpen: () => void;
  onSettingsClose: () => void;
  children: ReactNode;
}) {
  return <AppShell data-mobile-navigation={mobileOpen ? 'open' : 'closed'} header={{ height: 68 }} navbar={{ width: 80, breakpoint: 'sm', collapsed: { mobile: !mobileOpen } }} padding="md">
    <AppShell.Header className="app-header"><AppHeader onHome={() => { onNavigate('dashboard'); onCloseMobile(); }} token={token} onSettings={onSettingsOpen} onSignOut={onSignOut} onChangelog={() => onNavigate('changelog')} navigationOpen={mobileOpen} onToggleNavigation={onToggleMobile} onOpenNotifications={(id) => { onOpenNotification(id); onCloseMobile(); }} onOpenProfile={() => { onNavigate('profile'); onCloseMobile(); }} /></AppShell.Header>
    <AppShell.Navbar p="xs" className="navigation-rail"><AppNavigation view={view} onNavigate={(destination) => { onNavigate(destination); onCloseMobile(); }} onSettings={onSettingsOpen} onSignOut={onSignOut} /></AppShell.Navbar>
    <AppShell.Main><Box className="main-content">{children}</Box></AppShell.Main>
    <PreferencesModal token={token} opened={settingsOpen} onClose={onSettingsClose} />
  </AppShell>;
}
