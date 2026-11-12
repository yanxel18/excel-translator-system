import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { Job, Language, VocabularyGroup } from "../../api";
import { LANGUAGE_OPTIONS } from "../shared/language-options";
import { useLocale } from "../shared/LocaleProvider";

interface TranslationSettingsModalProps {
  job: Job | null;
  vocabularyGroups: VocabularyGroup[];
  busy: boolean;
  error: string;
  valid: boolean;
  onClose: () => void;
  onJobChange: (job: Job) => void;
  onSave: (startAfterSave?: boolean) => void;
}

export default function TranslationSettingsModal({
  job,
  vocabularyGroups,
  busy,
  error,
  valid,
  onClose,
  onJobChange,
  onSave,
}: TranslationSettingsModalProps) {
  const { t } = useLocale();
  const compatibleGroups = job
    ? vocabularyGroups.filter(
        (group) =>
          group.sourceLanguage === job.sourceLanguage &&
          group.targetLanguage === job.targetLanguage,
      )
    : [];

  const updateLanguage = (
    field: "sourceLanguage" | "targetLanguage",
    value: string | null,
  ) => {
    if (!job || !value) return;
    const next = { ...job, [field]: value as Language };
    if (
      !vocabularyGroups.some(
        (group) =>
          group.id === next.vocabularyGroupId &&
          group.sourceLanguage === next.sourceLanguage &&
          group.targetLanguage === next.targetLanguage,
      )
    ) {
      next.vocabularyGroupId = null;
    }
    onJobChange(next);
  };

  return (
    <Modal
      opened={Boolean(job)}
      onClose={onClose}
      title={t("Translation settings")}
      centered
    >
      {job && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t("Choose worksheets and languages before starting this job.")}
          </Text>
          <MultiSelect
            label={t("Worksheets")}
            data={job.availableSheets}
            value={job.selectedSheets}
            onChange={(selectedSheets) =>
              onJobChange({ ...job, selectedSheets })
            }
            searchable
            clearable={false}
          />
          <Select
            label={t("Source language")}
            data={LANGUAGE_OPTIONS}
            value={job.sourceLanguage}
            onChange={(value) => updateLanguage("sourceLanguage", value)}
          />
          <Select
            label={t("Target language")}
            data={LANGUAGE_OPTIONS}
            value={job.targetLanguage}
            onChange={(value) => updateLanguage("targetLanguage", value)}
          />
          <Select
            label={t("Protected vocabulary")}
            description={t(
              "Optional. Terms in a compatible group are preserved exactly.",
            )}
            data={compatibleGroups.map((group) => ({
              value: group.id,
              label: `${group.name} · ${group.entries.length} ${t("terms")}`,
            }))}
            value={job.vocabularyGroupId}
            onChange={(value) =>
              onJobChange({ ...job, vocabularyGroupId: value })
            }
            clearable
            searchable
          />
          {!compatibleGroups.length && (
            <Text size="xs" c="dimmed">
              {t(
                "No groups for this language pair yet. Create one in Vocabulary, or continue without protected terms.",
              )}
            </Text>
          )}
          {job.sourceLanguage === job.targetLanguage && (
            <Text c="red" size="sm" role="alert">
              {t("Choose two different languages.")}
            </Text>
          )}
          {error && (
            <Text c="red" size="sm" role="alert">
              {error}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => onSave()} loading={busy} disabled={!valid}>
              {t("Save settings")}
            </Button>
            <Button
              onClick={() => onSave(true)}
              loading={busy}
              disabled={!valid}
            >
              {t("Save and start")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
