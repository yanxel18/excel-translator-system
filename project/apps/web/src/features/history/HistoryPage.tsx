import { useCallback, useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  Languages,
  Trash2,
} from "lucide-react";
import ApiService, {
  type HistoryQuery,
  type HistorySortColumn,
  type Job,
  type Language,
} from "../../api";
import { SessionExpiredError, trackedFetch } from "../../api/client";
import IbisPreview from "./IbisPreview";
import { useLocale } from "../shared/LocaleProvider";
import { languageName } from "../shared/language-options";
import WorkbookIcon from "../shared/WorkbookIcon";
import "./HistoryPage.css";

const pageSizes = [10, 20, 30, 40, 50] as const;
const sortColumns: HistorySortColumn[] = [
  "fileName",
  "fileSize",
  "status",
  "sourceLanguage",
  "targetLanguage",
  "createdAt",
];
const languages: Language[] = ["ENGLISH", "JAPANESE", "CHINESE"];

function isLanguage(value: string | null): value is Language {
  return value !== null && languages.includes(value as Language);
}

function isSortColumn(value: string | null): value is HistorySortColumn {
  return value !== null && sortColumns.includes(value as HistorySortColumn);
}

function isPageSize(value: number): value is (typeof pageSizes)[number] {
  return pageSizes.includes(value as (typeof pageSizes)[number]);
}

export default function HistoryPage({
  token,
  page,
  search,
  onQueryChange,
}: {
  token: string;
  page: number;
  search: string;
  onQueryChange: (params: URLSearchParams) => void;
}) {
  const { t, locale } = useLocale();
  const params = new URLSearchParams(search);
  const queryText = params.get("q") ?? "";
  const sourceLanguage = isLanguage(params.get("sourceLanguage"))
    ? (params.get("sourceLanguage") as Language)
    : undefined;
  const targetLanguage = isLanguage(params.get("targetLanguage"))
    ? (params.get("targetLanguage") as Language)
    : undefined;
  const sort = isSortColumn(params.get("sort"))
    ? (params.get("sort") as HistorySortColumn)
    : "createdAt";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const requestedPageSize = Number(params.get("pageSize"));
  const pageSize = isPageSize(requestedPageSize) ? requestedPageSize : 10;

  const [searchValue, setSearchValue] = useState(queryText);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [version, setVersion] = useState<"source" | "translated">("translated");
  const [pendingDelete, setPendingDelete] = useState<Job | null>(null);
  const closePreview = useCallback(() => {
    setPreviewJob(null);
  }, []);

  useEffect(() => {
    setSearchValue(queryText);
  }, [queryText]);
  useEffect(() => {
    if (searchValue === queryText) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(search);
      const value = searchValue.trim();
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
      onQueryChange(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [onQueryChange, queryText, search, searchValue]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timer: number | undefined;
    const query: HistoryQuery = {
      q: queryText.trim() || undefined,
      sourceLanguage,
      targetLanguage,
      sort,
      direction,
      page,
      pageSize,
    };
    setLoading(true);
    setError("");
    const load = async (silent: boolean) => {
      let expired = false;
      try {
        const result = await ApiService.getHistory(
          token,
          query,
          controller.signal,
          silent,
        );
        if (!active) return;
        setJobs(result.data);
        setTotal(result.total);
        setError("");
      } catch (reason) {
        expired = reason instanceof SessionExpiredError;
        if (active && !controller.signal.aborted && !expired)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load history.",
          );
      } finally {
        if (active) {
          setLoading(false);
          if (!expired) timer = window.setTimeout(() => void load(true), 1200);
        }
      }
    };
    void load(false);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    direction,
    page,
    pageSize,
    queryText,
    refreshKey,
    sort,
    sourceLanguage,
    targetLanguage,
    token,
  ]);

  const updateQuery = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    onQueryChange(next);
  };

  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(search);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    onQueryChange(next);
  };

  const openPreview = (job: Job, nextVersion: "source" | "translated") => {
    setError("");
    setPreviewJob(job);
    setVersion(nextVersion);
  };

  const download = async (job: Job) => {
    setError("");
    try {
      const response = await trackedFetch(ApiService.downloadUrl(job.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${job.fileName.replace(/\.xlsx$/i, "")}-translated.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download failed.");
    }
  };

  const deleteJob = async () => {
    if (!pendingDelete) return;
    setError("");
    try {
      await ApiService.deleteHistoryItem(pendingDelete.id, token);
      setPendingDelete(null);
      const nextPage = Math.min(
        page,
        Math.max(1, Math.ceil(Math.max(0, total - 1) / pageSize)),
      );
      if (nextPage !== page) changePage(nextPage);
      else setRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not delete this workbook.",
      );
      setPendingDelete(null);
    }
  };

  const toggleSort = (column: HistorySortColumn) => {
    updateQuery({
      sort: column,
      direction: sort === column && direction === "asc" ? "desc" : "asc",
    });
  };

  const sortHeader = (column: HistorySortColumn, label: string) => (
    <Table.Th
      key={column}
      aria-sort={
        sort === column
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <UnstyledButton
        type="button"
        aria-label={`${t("Sort by")} ${t(label)}`}
        onClick={() => toggleSort(column)}
      >
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={600}>
            {t(label)}
          </Text>
          {sort !== column ? (
            <ArrowUpDown size={14} aria-hidden="true" />
          ) : direction === "asc" ? (
            <ArrowUp size={14} aria-hidden="true" />
          ) : (
            <ArrowDown size={14} aria-hidden="true" />
          )}
        </Group>
      </UnstyledButton>
    </Table.Th>
  );

  const totalPages = Math.ceil(total / pageSize);
  const emptyHistory =
    total === 0 && !queryText.trim() && !sourceLanguage && !targetLanguage;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text component="h1" fz="h2" fw={700}>
            {t("Translation history")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("Review, preview, download, or remove your workbooks.")}
          </Text>
        </div>
      </Group>

      <Paper withBorder p="md" radius="md">
        <TextInput
          type="search"
          label={t("Search workbooks")}
          placeholder={t("Search by Excel filename")}
          maxLength={200}
          value={searchValue}
          onChange={(event) => setSearchValue(event.currentTarget.value)}
          style={{ maxWidth: 420 }}
        />
      </Paper>

      {error && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}
      <Text size="sm" c="dimmed" role="status" aria-live="polite">
        {t("Results")}: {total}
      </Text>
      {loading && !jobs.length ? (
        <Stack aria-label={t("Loading history")} aria-busy="true">
          <Skeleton height={58} />
          <Skeleton height={58} />
          <Skeleton height={58} />
        </Stack>
      ) : !jobs.length ? (
        <Paper withBorder radius="lg" p="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={52} radius="xl" variant="light" color="blue">
              <WorkbookIcon size={24} />
            </ThemeIcon>
            <Text fw={600}>
              {emptyHistory
                ? t("No workbooks in history yet.")
                : t("No matching workbooks.")}
            </Text>
            {emptyHistory && (
              <Text size="sm" c="dimmed" ta="center">
                {t("Upload a workbook to start its translation.")}
              </Text>
            )}
          </Stack>
        </Paper>
      ) : (
        <Paper
          withBorder
          radius="lg"
          shadow="sm"
          style={{ overflow: "hidden" }}
        >
          <Group justify="space-between" p="lg">
            <Box>
              <Text fw={700}>{t("Translation history")}</Text>
              <Text size="sm" c="dimmed">
                {t("Review, preview, download, or remove your workbooks.")}
              </Text>
            </Box>
          </Group>
          <ScrollArea.Autosize
            className="history-table-scroll"
            mah="min(60vh, 36rem)"
            viewportProps={{
              role: "region",
              "aria-label": t("Translation history"),
              tabIndex: 0,
            }}
          >
            <Table
              highlightOnHover
              verticalSpacing="md"
              horizontalSpacing="lg"
              miw={1000}
            >
              <Table.Thead>
                <Table.Tr>
                  {sortHeader("fileName", "File name")}
                  {sortHeader("fileSize", "File size")}
                  {sortHeader("status", "Status")}
                  {sortHeader("sourceLanguage", "Source language")}
                  {sortHeader("targetLanguage", "Target language")}
                  {sortHeader("createdAt", "Created")}
                  <Table.Th>{t("Actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.map((job) => (
                  <Table.Tr key={job.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon
                          size={36}
                          radius="md"
                          color="blue"
                          variant="light"
                        >
                          <WorkbookIcon size={18} />
                        </ThemeIcon>
                        <UnstyledButton
                          className="history-filename"
                          onClick={() => openPreview(job, "source")}
                        >
                          <Text fw={600} size="sm" truncate>
                            {job.fileName}
                          </Text>
                        </UnstyledButton>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {(job.fileSize / 1024 / 1024).toFixed(2)} MB
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={
                          job.status === "COMPLETED"
                            ? "teal"
                            : job.status === "PROCESSING"
                              ? "blue"
                              : job.status === "FAILED"
                                ? "red"
                                : "gray"
                        }
                      >
                        {t(job.status.toLowerCase())}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {t(languageName(job.sourceLanguage))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {t(languageName(job.targetLanguage))}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {new Date(job.createdAt).toLocaleString(locale)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label={t("Preview source")}>
                          <ActionIcon
                            variant="subtle"
                            aria-label={`${t("Preview source")} ${job.fileName}`}
                            onClick={() => openPreview(job, "source")}
                          >
                            <Eye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        {job.status === "COMPLETED" && (
                          <>
                            <Tooltip label={t("Preview translation")}>
                              <ActionIcon
                                variant="subtle"
                                aria-label={`${t("Preview translation")} ${job.fileName}`}
                                onClick={() => openPreview(job, "translated")}
                              >
                                <Languages size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t("Download")}>
                              <ActionIcon
                                variant="subtle"
                                aria-label={`${t("Download")} ${job.fileName}`}
                                onClick={() => void download(job)}
                              >
                                <Download size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </>
                        )}
                        {job.status !== "PROCESSING" && (
                          <Tooltip label={t("Delete")}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label={`${t("Delete")} ${job.fileName}`}
                              onClick={() => setPendingDelete(job)}
                            >
                              <Trash2 size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea.Autosize>
        </Paper>
      )}

      <Group justify="center" align="end" gap="xs" wrap="nowrap">
        {totalPages > 1 && (
          <Pagination
            aria-label={t("History pages")}
            className="history-pagination"
            value={Math.min(page, totalPages)}
            onChange={changePage}
            total={totalPages}
            disabled={loading}
            size="xs"
            gap={4}
            siblings={0}
          />
        )}
        <Select
          label={t("Rows per page")}
          aria-label={t("Rows per page")}
          title={t("Rows per page")}
          size="xs"
          className="history-page-size"
          classNames={{ label: "history-page-size-label" }}
          data={pageSizes.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          value={String(pageSize)}
          onChange={(value) => {
            if (value && isPageSize(Number(value)))
              updateQuery({ pageSize: value === "10" ? undefined : value });
          }}
        />
      </Group>

      <Modal
        opened={Boolean(previewJob)}
        onClose={closePreview}
        title={
          <Group
            justify="space-between"
            wrap="nowrap"
            gap="md"
            style={{ minWidth: 0, flex: 1 }}
          >
            <Text size="sm" fw={600} truncate>
              {previewJob?.fileName ?? t("Workbook preview")}
            </Text>
            <Select
              aria-label={t("Preview version")}
              value={version}
              data={[
                { value: "source", label: t("Original") },
                { value: "translated", label: t("Translated") },
              ]}
              onChange={(value) => {
                if (value) setVersion(value as "source" | "translated");
              }}
              w={150}
            />
          </Group>
        }
        size="95%"
        centered
      >
        {previewJob && (
          <IbisPreview
            key={`${previewJob.id}-${version}`}
            jobId={previewJob.id}
            name={previewJob.fileName}
            version={version}
            token={token}
            onClose={closePreview}
          />
        )}
      </Modal>
      <Modal
        opened={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t("Delete workbook?")}
        centered
      >
        <Stack>
          <Text size="sm">
            {t("This removes {name} and its stored workbook files.").replace(
              "{name}",
              pendingDelete?.fileName ?? "",
            )}
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setPendingDelete(null)}>
              {t("Cancel")}
            </Button>
            <Button color="red" onClick={() => void deleteJob()}>
              {t("Delete")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
