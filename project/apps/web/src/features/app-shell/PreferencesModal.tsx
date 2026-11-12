import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { LOCALE_OPTIONS } from "../shared/locale";
import { useLocale } from "../shared/LocaleProvider";

export default function PreferencesModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { locale, setLocale, t } = useLocale();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Settings")}
      size="lg"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t("Choose your preferred display language.")}
        </Text>
        <Select
          label={t("Language")}
          data={LOCALE_OPTIONS}
          value={locale}
          onChange={(value) => {
            if (value === "en" || value === "ja" || value === "zh")
              setLocale(value);
          }}
        />
        <Group justify="flex-end">
          <Button onClick={onClose}>{t("Close")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
