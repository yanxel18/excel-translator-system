import { useCallback, useEffect, useRef, useState } from 'react';
import ApiService, { type Job } from '../../api';
import { trackedFetch } from '../../api/client';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function validateWorkbook(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return 'Select an .xlsx workbook.';
  if (file.size > MAX_FILE_SIZE) return 'Files must be 50 MB or smaller.';
  return null;
}

export function useWorkspaceController(token: string, translate: (message: string) => string) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasLoaded = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (!token) return;
    if (!hasLoaded.current) setJobsLoading(true);
    try { setJobs(await ApiService.getJobs(token, silent)); hasLoaded.current = true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : translate('Could not load jobs.')); }
    finally { setJobsLoading(false); }
  }, [token, translate]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === 'PROCESSING')) return;
    const timer = window.setInterval(() => void refresh(true), 1200);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : translate('Something went wrong.')); }
    finally { setBusy(false); }
  };

  const selectFile = (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    const validationError = validateWorkbook(nextFile);
    if (validationError) { setError(translate(validationError)); return; }
    setError(''); setFile(nextFile);
  };

  const upload = () => {
    if (!file) return;
    void run(async () => {
      await ApiService.uploadFile(file, token);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    });
  };

  const download = (job: Job) => void trackedFetch(ApiService.downloadUrl(job.id), {
    headers: { Authorization: `Bearer ${token}` },
  }).then(async (response) => {
    if (!response.ok) throw new Error('Download failed.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url; link.download = `${job.fileName.replace(/\.xlsx$/i, '')}-translated.xlsx`;
    link.click(); URL.revokeObjectURL(url);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Download failed.'));

  const reset = () => {
    setJobs([]); setError(''); setFile(null); hasLoaded.current = false;
    if (fileInput.current) fileInput.current.value = '';
  };

  return {
    jobs, jobsLoading, busy, error, file, fileInput,
    refresh, run, selectFile, upload, download,
    dismissError: () => setError(''), reset,
  };
}
