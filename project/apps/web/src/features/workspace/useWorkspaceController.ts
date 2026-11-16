import { useCallback, useEffect, useRef, useState } from "react";
import ApiService, { type Job } from "../../api";
import { SessionExpiredError, trackedFetch } from "../../api/client";

const DEFAULT_MAX_UPLOAD_SIZE_MB = 50;

export function validateWorkbook(
  file: File,
  maxUploadSizeMb = DEFAULT_MAX_UPLOAD_SIZE_MB,
): string | null {
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    return "Select an .xlsx workbook.";
  if (file.size > maxUploadSizeMb * 1024 * 1024)
    return "Workbook exceeds the configured upload limit.";
  return null;
}

export function useWorkspaceController(
  token: string,
  translate: (message: string) => string,
) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(
    DEFAULT_MAX_UPLOAD_SIZE_MB,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const hasLoaded = useRef(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const translateRef = useRef(translate);
  translateRef.current = translate;

  useEffect(() => {
    if (!token) {
      setMaxUploadSizeMb(DEFAULT_MAX_UPLOAD_SIZE_MB);
      return;
    }
    let active = true;
    setMaxUploadSizeMb(DEFAULT_MAX_UPLOAD_SIZE_MB);
    void ApiService.getSystemInfo()
      .then((info) => {
        if (active) setMaxUploadSizeMb(info.maxUploadSizeMb);
      })
      .catch(() => {
        if (active)
          setError(translateRef.current("Could not load upload settings."));
      });
    return () => {
      active = false;
    };
  }, [token]);

  const refresh = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!hasLoaded.current) setJobsLoading(true);
      try {
        const loadedJobs = await ApiService.getJobs(token, silent);
        if (tokenRef.current !== token) return;
        setJobs(loadedJobs);
        hasLoaded.current = true;
      } catch (reason) {
        if (tokenRef.current === token && !(reason instanceof SessionExpiredError))
          setError(
            reason instanceof Error
              ? reason.message
              : translate("Could not load jobs."),
          );
      } finally {
        if (tokenRef.current === token) setJobsLoading(false);
      }
    },
    [token, translate],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === "PROCESSING")) return;
    const timer = window.setInterval(() => void refresh(true), 1200);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (reason) {
      if (!(reason instanceof SessionExpiredError))
        setError(
          reason instanceof Error
            ? reason.message
            : translate("Something went wrong."),
        );
    } finally {
      setBusy(false);
    }
  };

  const selectFile = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    const validationError = validateWorkbook(nextFile, maxUploadSizeMb);
    if (validationError) {
      setError(translate(validationError));
      return;
    }
    setError("");
    setFile(nextFile);
  };

  const download = (job: Job) =>
    void trackedFetch(ApiService.downloadUrl(job.id), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Download failed.");
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `${job.fileName.replace(/\.xlsx$/i, "")}-translated.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((reason) => {
        if (!(reason instanceof SessionExpiredError))
          setError(
            reason instanceof Error ? reason.message : "Download failed.",
          );
      });

  const reset = () => {
    tokenRef.current = "";
    setJobs([]);
    setError("");
    setFile(null);
    setBusy(false);
    setJobsLoading(false);
    hasLoaded.current = false;
    if (fileInput.current) fileInput.current.value = "";
  };

  return {
    jobs,
    jobsLoading,
    busy,
    error,
    file,
    maxUploadSizeMb,
    fileInput,
    refresh,
    run,
    selectFile,
    download,
    dismissError: () => setError(""),
    reset,
  };
}
