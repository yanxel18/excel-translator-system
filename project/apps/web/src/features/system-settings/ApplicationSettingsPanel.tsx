import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  NumberInput,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { CircleAlert, Save, SlidersHorizontal } from "lucide-react";
import { useLocale } from "../shared/LocaleProvider";
import { management, type ApplicationSettings } from "./api";

type NumericValue = number | string;

const isIntegerBetween = (
  value: NumericValue,
  minimum: number,
  maximum: number,
): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= minimum &&
  value <= maximum;

export default function ApplicationSettingsPanel({
  token,
}: {
  token: string;
}) {
  const { t } = useLocale();
  const [settings, setSettings] = useState<ApplicationSettings | null>(null);
  const [uploadLimit, setUploadLimit] = useState<NumericValue>(50);
  const [concurrency, setConcurrency] = useState<NumericValue>(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    void management
      .applicationSettings(token)
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setUploadLimit(value.maxUploadSizeMb);
        setConcurrency(value.maxConcurrentTranslations);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t("Could not load file settings."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, t]);

  const validUploadLimit = isIntegerBetween(uploadLimit, 1, 50);
  const validConcurrency = isIntegerBetween(concurrency, 1, 5);
  const changed =
    settings !== null &&
    (uploadLimit !== settings.maxUploadSizeMb ||
      concurrency !== settings.maxConcurrentTranslations);

  const save = async () => {
    if (!validUploadLimit || !validConcurrency) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await management.updateApplicationSettings(token, {
        maxUploadSizeMb: uploadLimit,
        maxConcurrentTranslations: concurrency,
      });
      setSettings(updated);
      setUploadLimit(updated.maxUploadSizeMb);
      setConcurrency(updated.maxConcurrentTranslations);
      setNotice(t("File settings saved."));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("Could not save file settings."),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Stack gap="md" aria-busy="true" aria-label={t("Files & processing")}>
        <Skeleton height={28} width="35%" />
        <Skeleton height={72} />
        <Skeleton height={44} width={160} />
      </Stack>
    );

  return (
    <Paper withBorder p="lg" className="settings-panel">
      <Stack gap="lg">
        <div>
          <Stack gap="xs">
            <Stack gap={4}>
              <Text component="h2" fz="xl" fw={700} m={0}>
                <SlidersHorizontal
                  size={20}
                  aria-hidden="true"
                  style={{ verticalAlign: "middle", marginInlineEnd: 8 }}
                />
                {t("Files & processing")}
              </Text>
              <Text size="sm" c="dimmed">
                {t(
                  "Configure the upload size and the number of translations that can run at once.",
                )}
              </Text>
            </Stack>
          </Stack>
        </div>

        {error && (
          <Alert
            color="red"
            role="alert"
            icon={<CircleAlert size={18} aria-hidden="true" />}
          >
            {error}
          </Alert>
        )}
        {notice && (
          <Alert color="green" role="status">
            {notice}
          </Alert>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label={t("Maximum workbook size (MB)")}
            description={t("Keep uploads between 1 and 50 MB.")}
            value={uploadLimit}
            min={1}
            max={50}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            onChange={setUploadLimit}
          />
          <NumberInput
            label={t("Concurrent translations")}
            description={t("Choose between 1 and 5 concurrent translations.")}
            value={concurrency}
            min={1}
            max={5}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            onChange={setConcurrency}
          />
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          {t(
            "Changes apply to new job admissions and don't interrupt running translations.",
          )}
        </Text>
        <Button
          type="button"
          leftSection={<Save size={16} aria-hidden="true" />}
          loading={saving}
          disabled={!changed || !validUploadLimit || !validConcurrency}
          onClick={() => void save()}
        >
          {t("Save file settings")}
        </Button>
      </Stack>
    </Paper>
  );
}
