import { useEffect } from 'react';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useLocale } from '../shared/LocaleProvider';
import { useNotificationFeed } from './useNotificationFeed';
import NotificationFeed from './NotificationFeed';
export default function NotificationsPage({ token, selectedId }: { token: string; selectedId?: string }) {
  const { t } = useLocale();
  const feed = useNotificationFeed(token);
  const found = feed.items.some((item) => item.id === selectedId);
  useEffect(() => { if (selectedId && !found && feed.cursor && !feed.loading && !feed.error) void feed.load(feed.cursor); }, [selectedId, found, feed.cursor, feed.loading, feed.error, feed.load]);
  return <Stack gap="md" className="notifications-page"><Group justify="space-between"><div><Text component="h1" fz="h2" fw={700}>{t('Notifications')}</Text><Text size="sm" c="dimmed">{t('Updates about your workbook translations.')}</Text></div><Button variant="default" size="xs" onClick={() => void feed.load()} loading={feed.loading}>{t('Refresh')}</Button></Group><Paper p={{ base: 'sm', sm: 'lg' }} radius="lg" className="notifications-page-card"><NotificationFeed {...feed} selectedId={selectedId} onLoad={() => { void feed.load(feed.cursor ?? undefined); }} onSelect={(item) => { if (!item.isRead) void feed.markRead(item.id); }} />{selectedId && !found && !feed.loading && !feed.cursor && !feed.error && <Text size="sm" c="dimmed" role="status">{t('Notification is no longer available.')}</Text>}</Paper></Stack>;
}
