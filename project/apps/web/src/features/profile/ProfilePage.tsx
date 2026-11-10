import { useEffect, useState } from 'react';
import { Button, Paper, Stack, Text, TextInput } from '@mantine/core';
import ApiService, { type UserProfile } from '../../api';

export default function ProfilePage({ token }: { token: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    void ApiService.getProfile(token).then((value) => { if (active) { setProfile(value); setFullName(value.fullName ?? ''); setEmail(value.email ?? ''); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load profile.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token]);
  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    try { const value = await ApiService.updateProfile({ fullName: fullName || null, email: email || null }, token); setProfile(value); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  };
  return <Stack gap="md"><div><Text component="h1" fz="h2" fw={700}>Profile</Text><Text size="sm" c="dimmed">Manage the details attached to your account.</Text></div>
    <Paper withBorder p="lg" maw={560}><Stack><TextInput label="Username" value={profile?.username ?? ''} readOnly disabled /><TextInput label="Full name" value={fullName} onChange={(event) => setFullName(event.currentTarget.value)} maxLength={120} disabled={busy} /><TextInput label="Email" type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} maxLength={254} disabled={busy} />
      {error && <Text c="red" role="alert">{error}</Text>}{saved && <Text c="teal" role="status">Profile saved.</Text>}<Button onClick={() => void save()} loading={saving || busy} disabled={!profile}>Save changes</Button></Stack></Paper>
  </Stack>;
}
