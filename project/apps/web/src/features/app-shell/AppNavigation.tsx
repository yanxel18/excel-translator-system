import { Divider, NavLink, ScrollArea, Text } from '@mantine/core';
import { BookOpen, Bell, History, LayoutDashboard, LogOut, Settings, UserRound, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { View } from './types';
import { useLocale } from '../shared/LocaleProvider';

const items: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'workspace', label: 'Workspace', icon: LayoutDashboard },
  { view: 'history', label: 'History', icon: History },
  { view: 'vocabulary', label: 'Vocabulary', icon: BookOpen },
  { view: 'notifications', label: 'Notifications', icon: Bell },
];

export default function AppNavigation({ view, onNavigate, onSettings, onSignOut }: {
  view: View;
  onNavigate: (view: View) => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const { t } = useLocale();
  return <>
    <div><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">{t('Translation')}</Text>
      {items.map(({ view: destination, label, icon: Icon }) => <NavLink component="button" type="button" key={destination} active={view === destination} label={t(label)} leftSection={<Icon size={17} />} onClick={() => onNavigate(destination)} />)}
    </div>
    <ScrollArea style={{ flex: 1 }} mt="md"><Divider mb="sm" /><Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" py="xs">{t('Account')}</Text>
      <NavLink component="button" type="button" label={t('Profile')} leftSection={<UserRound size={17} />} active={view === 'profile'} onClick={() => onNavigate('profile')} />
      <NavLink component="button" type="button" label={t('Changelog')} leftSection={<Volume2 size={17} />} active={view === 'changelog'} onClick={() => onNavigate('changelog')} />
    </ScrollArea>
    <div><Divider mb="sm" /><NavLink component="button" type="button" label={t('Settings')} leftSection={<Settings size={17} />} onClick={onSettings} /><NavLink component="button" type="button" label={t('Sign out')} leftSection={<LogOut size={17} />} onClick={onSignOut} /></div>
  </>;
}
