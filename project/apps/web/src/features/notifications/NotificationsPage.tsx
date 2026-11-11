import { useCallback, useEffect, useState } from 'react';
import { Button, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import ApiService, { type JobNotification } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

export default function NotificationsPage({ token }: { token: string }) {
  const { t, locale } = useLocale();
  const [items, setItems] = useState<JobNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try {
      const page = await ApiService.getNotifications(token, next);
      setItems((current) => next ? [...current, ...page.data] : page.data);
      setCursor(page.nextCursor);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load notifications.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const markRead = async (id: string) => {
    setError('');
    try {
      await ApiService.markNotificationRead(id, token);
      setItems((current) => current.map((item) => item.id === id ? { ...item, isRead: true } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update notification.'); }
  };

  return <Stack gap="md">
    <Group justify="space-between"><div><Text component="h1" fz="h2" fw={700}>{t('Notifications')}</Text><Text size="sm" c="dimmed">{t('Updates about your workbook translations.')}</Text></div><Button variant="default" size="xs" onClick={() => void load()} loading={loading}>{t('Refresh')}</Button></Group>
    {error && <Text c="red" role="alert">{error}</Text>}
    {loading && !items.length ? <Stack aria-label={t('Loading notifications')} aria-busy="true"><Skeleton height={76} /><Skeleton height={76} /><Skeleton height={76} /></Stack> : !items.length ? <Paper withBorder p="xl"><Text c="dimmed">{t('No notifications yet.')}</Text></Paper> : <Stack gap="sm">{items.map((item) => <Paper key={item.id} withBorder p="md" radius="md"><Group justify="space-between" align="start"><div><Text fw={item.isRead ? 500 : 700}>{item.title}{!item.isRead && ` · ${t('New')}`}</Text><Text size="sm">{item.message}</Text><Text size="xs" c="dimmed" mt="xs">{new Date(item.createdAt).toLocaleString(locale)}</Text></div>{!item.isRead && <Button variant="subtle" size="xs" onClick={() => void markRead(item.id)}>{t('Mark as read')}</Button>}</Group></Paper>)}</Stack>}
    {cursor && <Group justify="center"><Button variant="default" loading={loading} onClick={() => void load(cursor)}>{t('Load older notifications')}</Button></Group>}
  </Stack>;
}
