import { ActionIcon, Box, Burger, Group, Indicator, Menu, Popover, Text, ThemeIcon, UnstyledButton, useMantineColorScheme } from '@mantine/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, Languages, LogOut, Moon, Settings, Sun, UserRound, Volume2 } from 'lucide-react';
import ApiService from '../../api';
import { useLocale } from '../shared/LocaleProvider';
import NotificationPreview from '../notifications/NotificationPreview';
import { hasActiveRequests, subscribeToRequests } from '../../api/request-progress';

export default function AppHeader({ isAdmin, onSystemSettings, token, navigationOpen, onToggleNavigation, onOpenNotifications, onOpenProfile, onSettings, onSignOut, onChangelog, onHome }: {
  isAdmin: boolean; onSystemSettings: () => void; token: string; navigationOpen: boolean; onToggleNavigation: () => void; onOpenNotifications: (id?: string) => void; onHome: () => void; onOpenProfile: () => void; onSettings: () => void; onSignOut: () => void; onChangelog: () => void;
}) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { t } = useLocale();
  const requestsActive = useSyncExternalStore(subscribeToRequests, hasActiveRequests, () => false);
  const [showProgress, setShowProgress] = useState(false);
  const [opened, setOpened] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => { if (!requestsActive) { setShowProgress(false); return; } const timer = window.setTimeout(() => setShowProgress(true), 180); return () => window.clearTimeout(timer); }, [requestsActive]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void ApiService.getUnreadNotificationCount(token).then((value) => { if (active) setUnreadCount(value.count); }).catch(() => {}); };
    refresh(); const timer = window.setInterval(refresh, 30000); window.addEventListener('notifications-updated', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('notifications-updated', refresh); };
  }, [token]);
  return <><Group h="100%" px="lg" justify="space-between"><Group gap="sm"><Burger hiddenFrom="sm" opened={navigationOpen} onClick={onToggleNavigation} aria-label={t('Toggle navigation')} size="sm" /><UnstyledButton onClick={onHome} aria-label={t('Home')}><Group gap="sm"><ThemeIcon size={38} radius="md" color="blue"><Languages size={20} /></ThemeIcon><Box><Text fw={800}>Excel Translator</Text><Text size="xs" c="dimmed">{t('Workbook translation')}</Text></Box></Group></UnstyledButton></Group>
    <Group gap="xs"><Popover opened={opened} onChange={setOpened} position="bottom-end" width={420} shadow="xl" withinPortal><Popover.Target><Indicator label={unreadCount > 99 ? '99+' : unreadCount} disabled={!unreadCount} size={20} color="red"><ActionIcon variant="light" color="blue" size="lg" aria-label={t('Open notifications')} onClick={() => setOpened(!opened)}><Bell size={19} /></ActionIcon></Indicator></Popover.Target><Popover.Dropdown className="notification-popover">{opened && <NotificationPreview token={token} unreadCount={unreadCount} onOpen={(id) => { setOpened(false); onOpenNotifications(id); }} />}</Popover.Dropdown></Popover>
    <ActionIcon variant="subtle" color="blue" size="lg" aria-label={t('Toggle color theme')} onClick={() => toggleColorScheme()}>{colorScheme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</ActionIcon>
    <Menu position="bottom-end" shadow="lg" withinPortal><Menu.Target><ActionIcon variant="light" color="blue" size="lg" aria-label={t('Account')}><UserRound size={19} /></ActionIcon></Menu.Target><Menu.Dropdown><Menu.Item leftSection={<UserRound size={16} />} onClick={onOpenProfile}>{t('Profile')}</Menu.Item>{isAdmin && <Menu.Item leftSection={<Settings size={16} />} onClick={onSystemSettings}>{t('System Settings')}</Menu.Item>}<Menu.Item leftSection={<Settings size={16} />} onClick={onSettings}>{t('Settings')}</Menu.Item><Menu.Item leftSection={<Volume2 size={16} />} onClick={onChangelog}>{t('Changelog')}</Menu.Item><Menu.Divider /><Menu.Item color="red" leftSection={<LogOut size={16} />} onClick={onSignOut}>{t('Sign out')}</Menu.Item></Menu.Dropdown></Menu></Group></Group>
    {showProgress && <div className="request-progress" role="progressbar" aria-label={t('processing')}><span /></div>}</>;
}
