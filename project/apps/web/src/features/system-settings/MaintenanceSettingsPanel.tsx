import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { CalendarClock, CircleAlert, Save } from "lucide-react";
import { useLocale } from "../shared/LocaleProvider";
import {
  instantToLocalDateTime,
  localDateTimeToUtc,
  type LocalTimeResult,
} from "./maintenance-time";
import { management, type MaintenanceSchedule } from "./api";

function scheduleStatus(
  schedule: MaintenanceSchedule,
  now: number,
): string {
  if (!schedule.startsAt && !schedule.endsAt && !schedule.enabled)
    return "No maintenance notice is configured yet.";
  if (!schedule.startsAt || !schedule.endsAt)
    return "Saved maintenance schedule has invalid dates.";
  const startsAt = Date.parse(schedule.startsAt);
  const endsAt = Date.parse(schedule.endsAt);
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    startsAt >= endsAt
  )
    return "Saved maintenance schedule has invalid dates.";
  if (!schedule.enabled) return "Maintenance notice is disabled.";
  if (now < startsAt) return "Maintenance notice is scheduled.";
  if (now < endsAt) return "Maintenance is active now.";
  return "The maintenance window has expired.";
}

function fieldError(result: LocalTimeResult, field: "Start" | "End", t: (s: string) => string) {
  if (result.kind === "ambiguous")
    return t(`${field} time occurs twice in this time zone. Choose a different local time.`);
  if (result.kind === "nonexistent")
    return t(`${field} time does not exist in this time zone. Choose a valid local time.`);
  if (result.kind === "invalid")
    return t("Enter a valid local date and time.");
  return "";
}

export default function MaintenanceSettingsPanel({ token }: { token: string }) {
  const { t } = useLocale();
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const [schedule, setSchedule] = useState<MaintenanceSchedule | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setLoading(true);
    setLoadError(false);
    void management
      .maintenanceSchedule(token, controller.signal)
      .then((value) => {
        if (!active) return;
        setSchedule(value);
        setEnabled(value.enabled);
        setStartTime(instantToLocalDateTime(value.startsAt, timeZone));
        setEndTime(instantToLocalDateTime(value.endsAt, timeZone));
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [retry, timeZone, token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const originalStart = instantToLocalDateTime(schedule?.startsAt ?? null, timeZone);
  const originalEnd = instantToLocalDateTime(schedule?.endsAt ?? null, timeZone);
  const startResult =
    schedule?.startsAt &&
    Number.isFinite(Date.parse(schedule.startsAt)) &&
    startTime === originalStart
      ? ({ kind: "valid", iso: new Date(schedule.startsAt).toISOString() } as const)
      : localDateTimeToUtc(startTime, timeZone);
  const endResult =
    schedule?.endsAt &&
    Number.isFinite(Date.parse(schedule.endsAt)) &&
    endTime === originalEnd
      ? ({ kind: "valid", iso: new Date(schedule.endsAt).toISOString() } as const)
      : localDateTimeToUtc(endTime, timeZone);
  const startError = fieldError(startResult, "Start", t);
  const endError = fieldError(endResult, "End", t);
  const orderError =
    startResult.kind === "valid" &&
    endResult.kind === "valid" &&
    Date.parse(startResult.iso) >= Date.parse(endResult.iso)
      ? t("End time must be later than start time.")
      : "";
  const validationError = startError || endError || orderError;
  const changed =
    schedule !== null &&
    (enabled !== schedule.enabled ||
      startTime !== originalStart ||
      endTime !== originalEnd);
  const canSave =
    changed &&
    startResult.kind === "valid" &&
    endResult.kind === "valid" &&
    !orderError &&
    !saving;

  const updateField = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setSaveError(false);
    setSaved(false);
  };

  const save = async () => {
    if (!canSave || startResult.kind !== "valid" || endResult.kind !== "valid")
      return;
    setSaving(true);
    setSaveError(false);
    setSaved(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const updated = await management.updateMaintenanceSchedule(token, {
        enabled,
        startsAt: startResult.iso,
        endsAt: endResult.iso,
      }, controller.signal);
      setSchedule(updated);
      setEnabled(updated.enabled);
      setStartTime(instantToLocalDateTime(updated.startsAt, timeZone));
      setEndTime(instantToLocalDateTime(updated.endsAt, timeZone));
      setNow(Date.now());
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      window.clearTimeout(timeout);
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Stack gap="md" role="status" aria-busy="true" aria-label={t("Loading maintenance schedule…")}>
        <Skeleton height={28} width="35%" />
        <Skeleton height={72} />
        <Skeleton height={44} width={180} />
      </Stack>
    );

  if (loadError)
    return (
      <Alert color="red" role="alert" icon={<CircleAlert size={18} aria-hidden="true" />}>
        <Stack gap="sm">
          <Text>{t("Could not load the maintenance schedule.")}</Text>
          <Button
            type="button"
            variant="default"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("Retry loading maintenance schedule")}
          </Button>
        </Stack>
      </Alert>
    );

  if (!schedule) return null;

  const status = scheduleStatus(schedule, now);
  const statusColor =
    status === "Maintenance is active now."
      ? "blue"
      : status === "Saved maintenance schedule has invalid dates."
        ? "red"
        : "gray";

  return (
    <Paper withBorder p="lg" className="settings-panel maintenance-settings">
      <Stack gap="lg">
        <div>
          <Text component="h2" fz="xl" fw={700} m={0}>
            <CalendarClock
              size={20}
              aria-hidden="true"
              style={{ verticalAlign: "middle", marginInlineEnd: 8 }}
            />
            {t("Maintenance notices")}
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {t("Configure the maintenance notice shown to signed-in users.")}
          </Text>
        </div>

        <Paper
          withBorder
          p="sm"
          role="status"
          aria-label={t("Maintenance schedule status")}
          className="maintenance-schedule-status"
        >
          <Text c={statusColor} fw={600}>
            {t(status)}
          </Text>
        </Paper>

        {validationError && (
          <Alert color="red" role="alert" icon={<CircleAlert size={18} aria-hidden="true" />}>
            {validationError}
          </Alert>
        )}
        {saveError && (
          <Alert color="red" role="alert" icon={<CircleAlert size={18} aria-hidden="true" />}>
            {t("Could not save the maintenance schedule.")}
          </Alert>
        )}
        {saved && (
          <Text role="status" c="green" fw={600}>
            {t("Maintenance schedule saved.")}
          </Text>
        )}

        <Text size="sm">
          {t("Browser time zone")}: <strong>{timeZone}</strong>
        </Text>
        <Text size="sm" c="dimmed">
          {t("Enter both local start and end times. They are saved as UTC instants.")}
        </Text>
        <Switch
          label={t("Enable maintenance notice")}
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.currentTarget.checked);
            setSaveError(false);
            setSaved(false);
          }}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <div>
            <TextInput
              type="datetime-local"
              step={60}
              label={t("Start time")}
              value={startTime}
              aria-invalid={Boolean(startError || orderError)}
              onChange={(event) => updateField(setStartTime)(event.currentTarget.value)}
            />
            {startResult.kind === "valid" && (
              <Text size="sm" c="dimmed" mt={4}>
                {t("UTC instant")}: {startResult.iso}
              </Text>
            )}
          </div>
          <div>
            <TextInput
              type="datetime-local"
              step={60}
              label={t("End time")}
              value={endTime}
              aria-invalid={Boolean(endError || orderError)}
              onChange={(event) => updateField(setEndTime)(event.currentTarget.value)}
            />
            {endResult.kind === "valid" && (
              <Text size="sm" c="dimmed" mt={4}>
                {t("UTC instant")}: {endResult.iso}
              </Text>
            )}
          </div>
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          {t("This notice is informational and does not restrict application access.")}
        </Text>
        <Button
          type="button"
          leftSection={<Save size={16} aria-hidden="true" />}
          loading={saving}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {t("Save maintenance schedule")}
        </Button>
      </Stack>
    </Paper>
  );
}
