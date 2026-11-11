import { useEffect, useState } from 'react';
import { Button, Paper, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import ApiService, { type UserProfile } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

export default function ProfilePage({ token }: { token: string }) {
  const { t } = useLocale();
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
  return <Stack gap="md"><div><Text component="h1" fz="h2" fw={700}>{t('Profile')}</Text><Text size="sm" c="dimmed">{t('Manage the details attached to your account.')}</Text></div>
    {busy ? <Paper withBorder p="lg" maw={560} aria-label={t('Loading profile')} aria-busy="true"><Stack><Skeleton height={36} /><Skeleton height={36} /><Skeleton height={36} /></Stack></Paper> : <Paper withBorder p="lg" maw={560}><Stack><TextInput label={t('Username')} value={profile?.username ?? ''} readOnly disabled /><TextInput label={t('Full name')} value={fullName} onChange={(event) => setFullName(event.currentTarget.value)} maxLength={120} disabled={busy} /><TextInput label={t('Email')} type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} maxLength={254} disabled={busy} />
      {error && <Text c="red" role="alert">{error}</Text>}{saved && <Text c="teal" role="status">{t('Profile saved.')}</Text>}<Button onClick={() => void save()} loading={saving || busy} disabled={!profile}>{t('Save changes')}</Button></Stack></Paper>}
  </Stack>;
}
