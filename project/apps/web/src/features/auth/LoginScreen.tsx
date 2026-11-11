import { useState, FormEvent } from 'react';
import { Box, Button, Center, Group, Paper, Select, Stack, Text, ThemeIcon } from '@mantine/core';
import { Languages } from 'lucide-react';
import { LOCALE_OPTIONS } from '../shared/locale';
import { useLocale } from '../shared/LocaleProvider';

export default function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const { locale, setLocale, t } = useLocale();
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(username, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };

  return <Center mih="100vh" p="md" className="login-page"><Paper component="form" onSubmit={submit} withBorder shadow="sm" radius="md" p="xl" w="100%" maw={400}>
    <Stack gap="md"><Group justify="space-between"><ThemeIcon size={44} radius="md" color="teal"><Languages size={23} /></ThemeIcon><Select aria-label={t('Language')} data={LOCALE_OPTIONS} value={locale} onChange={(value) => { if (value === 'en' || value === 'ja' || value === 'zh') setLocale(value); }} w={130} /></Group><Box><Text fz="h2" fw={700}>{t('Welcome back')}</Text><Text c="dimmed" size="sm">{t('Sign in to manage workbook translations.')}</Text></Box>
      <label className="field-label">{t('Username')}<input value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" required /></label>
      <label className="field-label">{t('Password')}<input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" required /></label>
      {error && <Text c="red" size="sm" role="alert">{error}</Text>}<Button type="submit" loading={busy} fullWidth>{t('Sign in')}</Button><Text c="dimmed" size="xs" ta="center">{t('Local development account: user / password')}</Text>
    </Stack>
  </Paper></Center>;
}
