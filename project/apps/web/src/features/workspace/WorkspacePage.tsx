import {
  useState,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
} from "lucide-react";
import type { Job } from "../../api";
import JobList, { LoadingJobs } from "./JobList";
import { useLocale } from "../shared/LocaleProvider";
import IbisPreview from "../history/IbisPreview";
import WorkbookIcon from "../shared/WorkbookIcon";

interface WorkspacePageProps {
  file: File | null;
  maxUploadSizeMb: number;
  fileInput: RefObject<HTMLInputElement>;
  error: string;
  busy: boolean;
  uploadDisabled: boolean;
  uploadInProgress: boolean;
  jobs: Job[];
  jobsLoading: boolean;
  onDismissError: () => void;
  onSelectFile: (file: File | null) => void;
  onUpload: () => void;
  onRefresh: () => void;
  onHistory: () => void;
  onStart: (job: Job) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDownload: (job: Job) => void;
  onConfigure: (job: Job) => void;
  token: string;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function WorkspacePage({
  file,
  maxUploadSizeMb,
  fileInput,
  error,
  busy,
  uploadDisabled,
  uploadInProgress,
  jobs,
  jobsLoading,
  token,
  onDismissError,
  onSelectFile,
  onUpload,
  onRefresh,
  onHistory,
  onStart,
  onRetry,
  onCancel,
  onDownload,
  onConfigure,
}: WorkspacePageProps) {
  const { t } = useLocale();
  const [dragging, setDragging] = useState(false);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const ongoingJobs = jobs.filter(
    (job) => job.status === "PENDING" || job.status === "PROCESSING",
  );
  const recentJobs = jobs
    .filter((job) => job.status !== "PENDING" && job.status !== "PROCESSING")
    .sort(
      (a, b) =>
        Date.parse(b.completedAt ?? b.createdAt) -
        Date.parse(a.completedAt ?? a.createdAt),
    )
    .slice(0, 5);
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    onSelectFile(event.dataTransfer.files[0] || null);
  };
  const browseOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.current?.click();
    }
  };

  return (
    <Stack gap="xl">
      <Breadcrumbs separator={<ChevronRight size={14} />}>
        <Text size="sm">{t("Workspace")}</Text>
      </Breadcrumbs>
      <Group justify="space-between" align="end" className="workspace-heading">
        <Box>
          <Text component="h1" fz={26} fw={600}>
            {t("Translate a workbook")}
          </Text>
          <Text c="dimmed" mt={4}>
            {t("Upload an XLSX file and keep track of every translation.")}
          </Text>
        </Box>
        <Badge variant="light" color="blue" size="lg">
          XLSX · {t("Upload limit")}: {maxUploadSizeMb} MB
        </Badge>
      </Group>
      {error && (
        <Paper withBorder radius="md" p="sm" bg="red.0">
          <Group justify="space-between">
            <Text c="red" size="sm" role="alert">
              {error}
            </Text>
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={t("Dismiss error")}
              onClick={onDismissError}
            >
              ×
            </ActionIcon>
          </Group>
        </Paper>
      )}

      {!uploadInProgress && <Paper
        withBorder
        radius="lg"
        p={{ base: "lg", sm: "xl" }}
        className={`upload-panel upload-dropzone${dragging ? " is-dragging" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={t("Drop your workbook here or browse files")}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button"))
            fileInput.current?.click();
        }}
        onKeyDown={browseOnKey}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={onDrop}
      >
        <input
          ref={fileInput}
          type="file"
          aria-label={t("Choose an XLSX workbook")}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
        />
        <Stack align="center" gap="sm">
          <ThemeIcon size={52} radius="xl" color="blue" variant="light">
            <CloudUpload size={25} />
          </ThemeIcon>
          <Box ta="center">
            <Text fw={600}>{t("Drop your workbook here")}</Text>
            <Text c="dimmed" size="sm">
              {t("or click to browse from your computer")}
            </Text>
          </Box>
          {file ? (
            <Group gap="xs" justify="center" wrap="wrap">
              <CheckCircle2 size={17} color="var(--mantine-color-blue-6)" />
              <Text size="sm" fw={500}>
                {file.name}
              </Text>
              <Text size="xs" c="dimmed">
                {formatFileSize(file.size)}
              </Text>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => onSelectFile(null)}
              >
                {t("Change file")}
              </Button>
            </Group>
          ) : (
            <Button
              variant="light"
              size="sm"
              leftSection={<WorkbookIcon size={16} />}
              onClick={() => fileInput.current?.click()}
            >
              {t("Browse files")}
            </Button>
          )}
        </Stack>
      </Paper>}
      {file && !uploadInProgress && (
        <Group justify="flex-end">
          <Button
            onClick={onUpload}
            loading={busy}
            disabled={uploadDisabled}
            leftSection={<CloudUpload size={16} />}
          >
            {t("Upload workbook")}
          </Button>
        </Group>
      )}

      <SimpleGrid
        cols={{ base: 1, lg: 2 }}
        spacing="lg"
        style={{ alignItems: "start" }}
      >
        <Stack gap="sm">
          <Group justify="space-between" align="end">
            <Box>
              <Text component="h2" fz={18} fw={600}>
                {t("Ongoing")}
              </Text>
              <Text size="sm" c="dimmed">
                {t("Translations waiting to start or currently processing.")}
              </Text>
            </Box>
            <Button
              variant="default"
              size="xs"
              onClick={onRefresh}
              loading={jobsLoading}
            >
              {t("Refresh")}
            </Button>
          </Group>
          {jobsLoading ? (
            <LoadingJobs />
          ) : (
            <div aria-live="polite">
              <JobList
                jobs={ongoingJobs}
                busy={busy}
                onStart={onStart}
                onRetry={onRetry}
                onCancel={onCancel}
                onDownload={onDownload}
                onConfigure={onConfigure}
                onView={setPreviewJob}
              />
            </div>
          )}
        </Stack>
        <Paper withBorder radius="lg" p="md">
          <Group justify="space-between" align="start" mb="sm">
            <Box>
              <Text component="h2" fz={18} fw={600}>
                {t("Recent translations")}
              </Text>
              <Text size="sm" c="dimmed">
                {t("Check progress and download completed files.")}
              </Text>
            </Box>
            <Button
              variant="subtle"
              size="xs"
              rightSection={<ArrowRight size={14} />}
              onClick={onHistory}
            >
              {t("View all")}
            </Button>
          </Group>
          {jobsLoading ? (
            <LoadingJobs />
          ) : (
            <div aria-live="polite">
              <JobList
                compact
                jobs={recentJobs}
                busy={busy}
                onStart={onStart}
                onRetry={onRetry}
                onCancel={onCancel}
                onDownload={onDownload}
                onConfigure={onConfigure}
                onView={setPreviewJob}
              />
            </div>
          )}
        </Paper>
      </SimpleGrid>
      <Modal
        opened={Boolean(previewJob)}
        onClose={() => setPreviewJob(null)}
        title={previewJob?.fileName ?? t("Workbook preview")}
        size="95%"
        centered
      >
        {previewJob && (
          <IbisPreview
            key={previewJob.id}
            jobId={previewJob.id}
            name={previewJob.fileName}
            version="translated"
            token={token}
            onClose={() => setPreviewJob(null)}
          />
        )}
      </Modal>
    </Stack>
  );
}
