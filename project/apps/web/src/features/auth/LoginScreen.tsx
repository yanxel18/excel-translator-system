import { useState, FormEvent } from 'react';
import { Box, Button, Center, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { Languages } from 'lucide-react';

export default function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
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
    <Stack gap="md"><ThemeIcon size={44} radius="md" color="teal"><Languages size={23} /></ThemeIcon><Box><Text fz="h2" fw={700}>Welcome back</Text><Text c="dimmed" size="sm">Sign in to manage workbook translations.</Text></Box>
      <label className="field-label">Username<input value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" required /></label>
      <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" required /></label>
      {error && <Text c="red" size="sm" role="alert">{error}</Text>}<Button type="submit" loading={busy} fullWidth>Sign in</Button><Text c="dimmed" size="xs" ta="center">Local development account: user / password</Text>
    </Stack>
  </Paper></Center>;
}
