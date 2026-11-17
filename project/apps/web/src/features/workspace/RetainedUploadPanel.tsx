import { Alert, Button, Group, Paper, Progress, Stack, Text } from "@mantine/core";
import { useLocale } from "../shared/LocaleProvider";
import type { RetainedUploadView } from "./useRetainedUpload";

interface Props {
  upload: RetainedUploadView;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export default function RetainedUploadPanel({ upload, onPause, onResume, onCancel }: Props) {
  const { t } = useLocale();
  if (upload.phase === "idle" || upload.phase === "complete") return null;
  const labels = {
    checking: "Checking saved uploads",
    saving: "Saving workbook for recovery",
    transferring: "Uploading workbook",
    validating: "Validating workbook",
    "waiting-network": "Waiting for the connection",
    "waiting-busy": "Waiting for upload capacity",
    paused: "Upload paused",
    pausing: "Pausing upload",
    cancelling: "Cancelling upload",
    error: "Upload needs attention",
    complete: "Upload complete",
  } as const;
  const progress = upload.progress ?? (upload.record && {
    confirmedBytes: upload.record.confirmedBytes, fileSize: upload.record.fileSize,
  });
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600} role="status">{t(labels[upload.phase])}</Text>
        {upload.record && <Text>{upload.record.fileName}</Text>}
        {progress && (
          <>
            <div
              role="progressbar"
              aria-label={t("Confirmed upload progress")}
              aria-valuemin={0}
              aria-valuemax={progress.fileSize}
              aria-valuenow={progress.confirmedBytes}
            >
              <Progress
                value={100 * progress.confirmedBytes / progress.fileSize}
                aria-hidden="true"
              />
            </div>
            <Text size="sm">
              {`${(progress.confirmedBytes / 1048576).toFixed(2)} / ${(progress.fileSize / 1048576).toFixed(2)} MB`}
            </Text>
          </>
        )}
        {upload.storageMayBeEvicted && (
          <Alert color="yellow">{t("Browser storage is not persistent; the saved workbook may be removed by the browser.")}</Alert>
        )}
        {upload.message && <Alert color="red">{t(upload.message)}</Alert>}
        <Group>
          {["transferring", "validating", "waiting-network", "waiting-busy"].includes(upload.phase) && (
            <Button variant="default" onClick={onPause}>{t("Pause upload")}</Button>
          )}
          {(upload.phase === "paused" || (upload.phase === "error" && upload.record)) && (
            <Button onClick={onResume}>{t("Resume upload")}</Button>
          )}
          {upload.record && ["transferring", "validating", "waiting-network", "waiting-busy", "paused", "error"].includes(upload.phase) && (
            <Button variant="default" color="red" onClick={onCancel}>{t("Cancel upload")}</Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
