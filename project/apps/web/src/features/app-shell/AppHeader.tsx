import { ActionIcon, Avatar, Box, Burger, Group, Progress, ThemeIcon, Tooltip, Text, useMantineColorScheme } from '@mantine/core';
import { Bell, Languages, Moon, Sun } from 'lucide-react';
import { useLocale } from '../shared/LocaleProvider';

export default function AppHeader({ loading, navigationOpen, onToggleNavigation, onOpenNotifications }: {
  loading: boolean;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  onOpenNotifications: () => void;
}) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { t } = useLocale();

  return <>
    <Group h="100%" px="lg" justify="space-between"><Group gap="sm"><Burger hiddenFrom="sm" opened={navigationOpen} onClick={onToggleNavigation} aria-label={t('Toggle navigation')} size="sm" /><ThemeIcon size={34} radius="md" color="teal"><Languages size={19} /></ThemeIcon><Box><Text fw={700}>Sheetling</Text><Text size="xs" c="dimmed">{t('Workbook translation')}</Text></Box></Group>
      <Group gap="xs"><Tooltip label={t('Notifications')}><ActionIcon variant="subtle" color="gray" aria-label={t('Open notifications')} onClick={onOpenNotifications}><Bell size={18} /></ActionIcon></Tooltip><Tooltip label={t(colorScheme === 'dark' ? 'Use light theme' : 'Use dark theme')}><ActionIcon variant="subtle" color="gray" aria-label={t('Toggle color theme')} onClick={() => toggleColorScheme()}>{colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</ActionIcon></Tooltip><Avatar color="teal" radius="xl" size="sm" aria-label={t('Profile')}>U</Avatar></Group>
    </Group>
    {loading && <Progress className="top-loader" size={2} value={100} animated />}
  </>;
}
