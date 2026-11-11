import { useCallback, useEffect, useState } from 'react';
import { Button, Group, Paper, Skeleton, Stack, Text } from '@mantine/core';
import ApiService, { type ChangelogEntry } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

export default function ChangelogPage({ token }: { token: string }) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try { const page = await ApiService.getChangelog(token, next); setEntries((current) => next ? [...current, ...page.data] : page.data); setCursor(page.nextCursor); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load changelog.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return <Stack gap="md"><div><Text component="h1" fz="h2" fw={700}>{t('Changelog')}</Text><Text size="sm" c="dimmed">{t('Recent product updates.')}</Text></div>
    {error && <Text c="red" role="alert">{error}</Text>}{loading && !entries.length ? <Stack aria-label={t('Loading changelog')} aria-busy="true"><Skeleton height={96} /><Skeleton height={96} /></Stack> : !entries.length ? <Paper withBorder p="xl"><Text c="dimmed">{t('No updates have been published.')}</Text></Paper> : <Stack>{entries.map((entry) => <Paper key={entry.id} withBorder p="md"><Text fw={600}>{entry.title}</Text><Text size="xs" c="dimmed" mt={4}>{new Date(entry.publishedAt).toLocaleDateString(locale)}</Text><Text size="sm" mt="sm" style={{ whiteSpace: 'pre-wrap' }}>{entry.details}</Text></Paper>)}</Stack>}
    {cursor && <Group justify="center"><Button variant="default" loading={loading} onClick={() => void load(cursor)}>{t('Load older updates')}</Button></Group>}
  </Stack>;
}
