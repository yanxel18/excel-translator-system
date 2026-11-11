import { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, Switch, Text, TextInput } from '@mantine/core';
import ApiService, { type OidcAdminSettings } from '../../api';
import { useLocale } from '../shared/LocaleProvider';

const EMPTY_SETTINGS: OidcAdminSettings = {
  enabled: false,
  keycloakUrl: '',
  realm: '',
  clientId: '',
  issuerUrl: '',
  requiredGroup: '',
};

export default function AdminKeycloakSettings({ token }: { token: string }) {
  const { t } = useLocale();
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void ApiService.getOidcSettings(token)
      .then((value) => { if (active) setSettings(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t('Could not load Keycloak settings.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, t]);

  const update = (key: keyof OidcAdminSettings, value: string | boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setSettings(await ApiService.updateOidcSettings(settings, token));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Could not save Keycloak settings.'));
    } finally {
      setSaving(false);
    }
  };

  return <Paper withBorder p="lg" maw={680}>
    <Stack gap="sm">
      <div><Text fw={650}>{t('Administrator settings')}</Text><Text size="sm" c="dimmed">{t('Configure Keycloak sign-in for this application.')}</Text></div>
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {saved && <Alert color="teal" role="status">{t('Keycloak settings saved. They apply to new sign-ins.')}</Alert>}
      <Switch label={t('Enable Keycloak sign-in')} checked={settings.enabled} onChange={(event) => update('enabled', event.currentTarget.checked)} disabled={loading} />
      <TextInput label={t('Keycloak server URL')} placeholder="https://keycloak.example.com" value={settings.keycloakUrl} onChange={(event) => update('keycloakUrl', event.currentTarget.value)} disabled={loading} />
      <TextInput label={t('Realm')} value={settings.realm} onChange={(event) => update('realm', event.currentTarget.value)} disabled={loading} />
      <TextInput label={t('Client ID')} value={settings.clientId} onChange={(event) => update('clientId', event.currentTarget.value)} disabled={loading} />
      <TextInput label={t('Issuer URL')} placeholder="https://keycloak.example.com/realms/excel-translator" value={settings.issuerUrl} onChange={(event) => update('issuerUrl', event.currentTarget.value)} disabled={loading} />
      <TextInput label={t('Required group (optional)')} value={settings.requiredGroup} onChange={(event) => update('requiredGroup', event.currentTarget.value)} disabled={loading} />
      <Button onClick={() => void save()} loading={saving} disabled={loading}>{t('Save Keycloak settings')}</Button>
    </Stack>
  </Paper>;
}
