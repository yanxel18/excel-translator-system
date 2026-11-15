import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { CalendarClock, CircleAlert } from "lucide-react";
import { useLocale } from "../shared/LocaleProvider";
import { formatInstant } from "../system-settings/maintenance-time";
import {
  getMaintenanceNotice,
  type MaintenanceNotice as Notice,
} from "../system-settings/api";

const pollIntervalMs = 15_000;
const requestTimeoutMs = 8_000;

export default function MaintenanceNotice({ token }: { token: string }) {
  const { locale, t } = useLocale();
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let boundaryTimer = 0;
    const refresh = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        requestTimeoutMs,
      );
      try {
        const next = await getMaintenanceNotice(token, controller.signal);
        if (
          next.active &&
          (!Number.isFinite(Date.parse(next.startsAt)) ||
            !Number.isFinite(Date.parse(next.endsAt)) ||
            Date.parse(next.startsAt) >= Date.parse(next.endsAt))
        )
          throw new Error("Invalid maintenance notice");
        if (!active) return;
        const previous = noticeRef.current;
        if (
          !previous ||
          previous.active !== next.active ||
          (previous.active &&
            next.active &&
            (previous.startsAt !== next.startsAt ||
              previous.endsAt !== next.endsAt))
        ) {
          noticeRef.current = next;
          setNotice(next);
        }
        setError(false);
        setLoading(false);
        window.clearTimeout(boundaryTimer);
        if (next.active) {
          const untilEnd = Date.parse(next.endsAt) - Date.now();
          boundaryTimer = window.setTimeout(
            () => void refresh(),
            Math.max(1_000, untilEnd),
          );
        }
      } catch {
        if (active) {
          setError(true);
          setLoading(false);
        }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };

    void refresh();
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(pollTimer);
      window.clearTimeout(boundaryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [retry, token]);

  if (!loading && !error && !notice?.active) return null;

  const zone = <strong>{timeZone}</strong>;
  return (
    <Stack gap="sm" mb="md">
      {loading && !notice && (
        <Alert
          color="gray"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {t("Checking maintenance notice…")}
        </Alert>
      )}
      {error && (
        <Alert
          color="red"
          role="alert"
          icon={<CircleAlert size={18} aria-hidden="true" />}
        >
          <Group justify="space-between" align="center" wrap="wrap">
            <Text>{t("Could not check the maintenance notice.")}</Text>
            <Button
              type="button"
              size="compact-sm"
              variant="default"
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              {t("Retry checking maintenance notice")}
            </Button>
          </Group>
        </Alert>
      )}
      {notice?.active && (
        <Paper
          withBorder
          p="md"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="maintenance-notice"
        >
          <Stack gap={4}>
            <Group gap="xs">
              <CalendarClock size={20} aria-hidden="true" />
              <Text fw={700}>{t("Scheduled maintenance")}</Text>
            </Group>
            <Text>{t("The service may be temporarily unavailable during this maintenance window.")}</Text>
            <Text size="sm">
              {t("Start")}: {formatInstant(notice.startsAt, locale, timeZone)} ·{" "}
              {t("End")}: {formatInstant(notice.endsAt, locale, timeZone)}
            </Text>
            <Text size="sm">
              {t("Times are shown in your browser time zone")}: {zone}
            </Text>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
