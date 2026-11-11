import { useState, FormEvent } from 'react';
import { Box, Button, Center, Divider, Group, Paper, Select, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { Languages } from 'lucide-react';
import { LOCALE_OPTIONS } from '../shared/locale';
import { useLocale } from '../shared/LocaleProvider';

export default function LoginScreen({ onLogin, onKeycloakLogin, oidcBusy = false, oidcError = '' }: {
  onLogin: (username: string, password: string) => Promise<void>;
  onKeycloakLogin?: () => Promise<void>;
  oidcBusy?: boolean;
  oidcError?: string;
}) {
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

  return <Center mih="100vh" p="md" className="login-page"><Paper component="form" onSubmit={submit} withBorder shadow="sm" radius="lg" p={{ base: 'lg', sm: 'xl' }} w="100%" maw={420} className="login-card">
    <Stack gap="md"><Group justify="space-between"><ThemeIcon size={44} radius="md" color="blue"><Languages size={23} /></ThemeIcon><Select aria-label={t('Language')} data={LOCALE_OPTIONS} value={locale} onChange={(value) => { if (value === 'en' || value === 'ja' || value === 'zh') setLocale(value); }} w={130} /></Group><Box><Text fz="h2" fw={700}>{t('Welcome back')}</Text><Text c="dimmed" size="sm">{t('Sign in to manage workbook translations.')}</Text></Box>
      <TextInput label={t('Username')} value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" required />
      <TextInput label={t('Password')} type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" required />
      {(error || oidcError) && <Text c="red" size="sm" role="alert">{error || oidcError}</Text>}<Button type="submit" loading={busy} fullWidth>{t('Sign in')}</Button>
      {onKeycloakLogin && <><Divider label={t('or')} labelPosition="center" /><Button type="button" variant="default" loading={oidcBusy} onClick={() => void onKeycloakLogin()} fullWidth>{t('Continue with Keycloak')}</Button></>}
      <Text c="dimmed" size="xs" ta="center">{t('Local development account: user / password')}</Text>
    </Stack>
  </Paper></Center>;
}
