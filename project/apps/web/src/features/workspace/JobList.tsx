import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { Download, Eye, FolderClock } from "lucide-react";
import { Job } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import WorkbookIcon from "../shared/WorkbookIcon";

export function LoadingJobs() {
  return (
    <Stack gap="sm">
      {[1, 2, 3].map((item) => (
        <Paper key={item} withBorder p="md" radius="md">
          <Group wrap="nowrap">
            <Skeleton circle height={38} />
            <Box style={{ flex: 1 }}>
              <Skeleton height={14} width="45%" />
              <Skeleton height={11} mt={8} width="28%" />
            </Box>
            <Skeleton height={28} width={76} />
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}

export interface JobListProps {
  jobs: Job[];
  busy: boolean;
  onStart: (job: Job) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDownload: (job: Job) => void;
  onConfigure: (job: Job) => void;
  onView: (job: Job) => void;
  compact?: boolean;
}

function JobBadge({ status }: { status: Job["status"] }) {
  const { t } = useLocale();
  const color =
    status === "COMPLETED"
      ? "blue"
      : status === "PROCESSING"
        ? "blue"
        : status === "PENDING"
          ? "yellow"
          : "red";
  return (
    <Badge color={color} variant="light" size="sm">
      {t(status.toLowerCase())}
    </Badge>
  );
}

function EmptyJobs({ compact }: { compact: boolean }) {
  const { t } = useLocale();
  const content = (
    <Stack align="center" gap="xs">
      <ThemeIcon size={compact ? 38 : 46} variant="light" color="gray">
        <FolderClock size={compact ? 20 : 23} />
      </ThemeIcon>
      <Text fw={600}>{t("No translations yet")}</Text>
      <Text c="dimmed" size="sm" ta="center">
        {t("Upload a workbook to start its translation.")}
      </Text>
    </Stack>
  );
  return compact ? (
    <Center py="md">{content}</Center>
  ) : (
    <Paper withBorder radius="md" p="xl">
      <Center>{content}</Center>
    </Paper>
  );
}

function FileActions({
  job,
  onView,
  onDownload,
}: Pick<JobListProps, "onView" | "onDownload"> & { job: Job }) {
  const { t } = useLocale();
  return (
    <>
      <Tooltip label={t("View")}>
        <ActionIcon
          variant="light"
          aria-label={`${t("View")} ${job.fileName}`}
          onClick={() => onView(job)}
        >
          <Eye size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t("Download")}>
        <ActionIcon
          variant="light"
          aria-label={`${t("Download")} ${job.fileName}`}
          onClick={() => onDownload(job)}
        >
          <Download size={16} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}

export default function JobList({
  jobs,
  busy,
  onStart,
  onRetry,
  onCancel,
  onDownload,
  onConfigure,
  onView,
  compact = false,
}: JobListProps) {
  const { t } = useLocale();
  if (!jobs.length) return <EmptyJobs compact={compact} />;

  if (compact)
    return (
      <Stack gap={0}>
        {jobs.map((job, index) => (
          <Group
            key={job.id}
            justify="space-between"
            wrap="nowrap"
            py="xs"
            style={
              index < jobs.length - 1
                ? {
                    borderBottom:
                      "1px solid var(--mantine-color-default-border)",
                  }
                : undefined
            }
          >
            <Group wrap="nowrap" gap="sm" style={{ minWidth: 0 }}>
              <ThemeIcon variant="light" color="blue" size={34} radius="md">
                <WorkbookIcon size={17} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Group gap="xs" wrap="nowrap">
                  <Text fw={600} size="sm" truncate title={job.fileName}>
                    {job.fileName}
                  </Text>
                  <JobBadge status={job.status} />
                </Group>
                <Text c="dimmed" size="xs" mt={3}>
                  Added {new Date(job.createdAt).toLocaleString()}
                </Text>
              </Box>
            </Group>
            {job.status === "COMPLETED" && (
              <Group gap={4} wrap="nowrap">
                <FileActions
                  job={job}
                  onView={onView}
                  onDownload={onDownload}
                />
              </Group>
            )}
          </Group>
        ))}
      </Stack>
    );

  return (
    <Stack gap="sm">
      {jobs.map((job) => (
        <Paper key={job.id} withBorder p="md" radius="md" className="job-card">
          <Group align="center" wrap="nowrap" className="job-card-row">
            <ThemeIcon variant="light" color="blue" size={40} radius="md">
              <WorkbookIcon size={21} />
            </ThemeIcon>
            <Box className="job-main">
              <Group gap="xs" wrap="nowrap" className="job-title-row">
                <Text
                  fw={600}
                  size="sm"
                  truncate
                  className="job-file-name"
                  title={job.fileName}
                >
                  {job.fileName}
                </Text>
                <JobBadge status={job.status} />
              </Group>
              <Text c="dimmed" size="xs" mt={4}>
                Added {new Date(job.createdAt).toLocaleString()}{" "}
                {job.textCount !== undefined
                  ? ` \u2022 ${job.textCount} text items`
                  : ""}
              </Text>
              {job.error && (
                <Text c="red" size="xs" mt={6} role="alert">
                  {job.error}
                </Text>
              )}
              {job.status === "PROCESSING" && job.progress <= 0 && (
                <Group gap="xs" mt="sm" role="status">
                  <Loader size={14} color="blue" />
                  <Text size="xs" c="dimmed">
                    {t("processing")}
                  </Text>
                </Group>
              )}
              {job.status === "PROCESSING" && job.progress > 0 && (
                <>
                  <Progress
                    value={job.progress}
                    animated
                    mt="sm"
                    size="sm"
                    radius="xl"
                    aria-label={`${t("processing")}: ${job.progress}%`}
                  />
                  <Text
                    size="xs"
                    c="dimmed"
                    mt={4}
                  >{`${t("processing")} - ${job.progress}%`}</Text>
                </>
              )}
            </Box>
            <Box className="job-action">
              {job.status === "PENDING" && (
                <>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() => onConfigure(job)}
                  >
                    {t("Settings")}
                  </Button>
                  <Button size="xs" loading={busy} onClick={() => onStart(job)}>
                    {t("Start")}
                  </Button>
                </>
              )}
              {job.status === "PROCESSING" && (
                <Button
                  size="xs"
                  variant="default"
                  loading={busy}
                  onClick={() => onCancel(job.id)}
                >
                  {t("Cancel")}
                </Button>
              )}
              {job.status === "FAILED" && (
                <Button
                  size="xs"
                  loading={busy}
                  onClick={() => onRetry(job.id)}
                >
                  {t("Retry")}
                </Button>
              )}
              {job.status === "COMPLETED" && (
                <Group gap={4} wrap="nowrap">
                  <FileActions
                    job={job}
                    onView={onView}
                    onDownload={onDownload}
                  />
                </Group>
              )}
            </Box>
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
