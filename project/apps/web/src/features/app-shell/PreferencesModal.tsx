import { Button, Group, Modal, Select, Stack } from '@mantine/core';
import { LOCALE_OPTIONS } from '../shared/locale';
import { useLocale } from '../shared/LocaleProvider';
import ProfilePage from '../profile/ProfilePage';

export default function PreferencesModal({ token, opened, onClose }: { token: string; opened: boolean; onClose: () => void }) {
  const { locale, setLocale, t } = useLocale();

  return <Modal opened={opened} onClose={onClose} title={t('Settings')} size="lg" centered>
    <Stack>
      {opened && <ProfilePage token={token} />}
      <Select label={t('Language')} data={LOCALE_OPTIONS} value={locale} onChange={(value) => {
        if (value === 'en' || value === 'ja' || value === 'zh') setLocale(value);
      }} />
      <Group justify="flex-end"><Button onClick={onClose}>{t('Close')}</Button></Group>
    </Stack>
  </Modal>;
}
