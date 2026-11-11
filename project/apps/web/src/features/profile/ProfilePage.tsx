import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Group, Paper, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import ApiService, { type UserProfile } from '../../api';
import { useLocale } from '../shared/LocaleProvider';
import AdminKeycloakSettings from './AdminKeycloakSettings';

function ProfileIdenticon({ seed }: { seed: string }) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 3; x += 1) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    if (hash >>> 31) { cells.push([x, y]); if (x < 2) cells.push([4 - x, y]); }
  }
  return <svg viewBox="0 0 5 5" width="100%" height="100%" role="img" aria-label="Generated profile avatar" shapeRendering="crispEdges">
    <rect width="5" height="5" fill={`hsl(${hue} 72% 94%)`} />
    {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={`hsl(${hue} 58% 42%)`} />)}
  </svg>;
}

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
  const displayName = profile?.fullName?.trim() || profile?.username || '';
  const identiconSeed = profile?.username || profile?.id || 'account';
  return <Stack gap="md" className="profile-page"><div><Text component="h1" fz="h2" fw={700}>{t('Profile')}</Text><Text size="sm" c="dimmed">{t('Manage the details attached to your account.')}</Text></div>
    {busy ? <Paper withBorder p="lg" maw={680} aria-label={t('Loading profile')} aria-busy="true"><Stack><Skeleton height={112} /><Skeleton height={36} /><Skeleton height={36} /></Stack></Paper> : profile && <Paper withBorder p="lg" maw={680} className="profile-card">
      <div className="profile-cover" aria-hidden="true" />
      <Group className="profile-identity" align="end" justify="space-between" wrap="wrap">
        <Group align="end" gap="md" wrap="nowrap"><Avatar className="profile-avatar" size={92} radius="50%" p={4} color="gray"><ProfileIdenticon seed={identiconSeed} /></Avatar><div className="profile-names"><Text fw={700} size="lg">{displayName}</Text><Text size="sm" c="dimmed">@{profile.username}</Text></div></Group>
        <Badge variant="light" color="teal" className="profile-active"><span className="profile-active-dot" />{t('Active')}</Badge>
      </Group>
      <Stack gap="xs" mt="md" className="profile-details"><Text size="sm"><span className="profile-detail-label">{t('Email')}:</span> {profile.email || t('Not provided')}</Text><Text size="sm"><span className="profile-detail-label">{t('Member since')}:</span> {new Date(profile.createdAt).toLocaleDateString()}</Text></Stack>
      <div className="profile-divider" />
      <Stack gap="sm"><Text fw={650} size="sm">{t('Account details')}</Text><TextInput label={t('Username')} value={profile.username} readOnly disabled /><TextInput label={t('Full name')} value={fullName} onChange={(event) => setFullName(event.currentTarget.value)} maxLength={120} /><TextInput label={t('Email')} type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} maxLength={254} />
        {error && <Text c="red" role="alert">{error}</Text>}{saved && <Text c="teal" role="status">{t('Profile saved.')}</Text>}<Button onClick={() => void save()} loading={saving} mt="xs">{t('Save changes')}</Button></Stack>
    </Paper>}
    {profile?.isAdmin && <AdminKeycloakSettings token={token} />}
  </Stack>;
}
