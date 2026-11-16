import { useEffect, useRef, useState } from "react";
import { SessionExpiredError } from "../../api/client";
import { UploadSessionApiError } from "../../api/upload-sessions";
import { cancelActiveRetainedUpload, cancelRetainedUploadAcrossTabs, cancelRetainedUploadWithRetry } from "./upload-cancellation";
import { pauseRetainedUploadAcrossTabs } from "./upload-coordination";
import { runRetainedUpload, type UploadProgress } from "./upload-orchestration";
import {
  loadRetainedUpload,
  RetentionError,
  saveRetainedUpload,
  updateRetainedUpload,
  type RetainedUpload,
} from "./upload-retention";

type Phase = "checking" | "idle" | "saving" | "transferring" | "validating" |
  "waiting-network" | "waiting-busy" | "paused" | "pausing" | "cancelling" | "error" | "complete";

export interface RetainedUploadView {
  ownerId: string;
  phase: Phase;
  record?: RetainedUpload;
  progress?: UploadProgress;
  message?: string;
  storageMayBeEvicted?: boolean;
}

interface Runtime {
  start: (file: File) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  abort: () => void;
}

export function useRetainedUpload(
  token: string,
  ownerId: string | null,
  onSaved: () => void,
  onCompleted: () => void,
) {
  const [view, setView] = useState<RetainedUploadView>({ ownerId: "", phase: "checking" });
  const runtime = useRef<Runtime | null>(null);
  const callbacks = useRef({ onSaved, onCompleted });
  callbacks.current = { onSaved, onCompleted };

  useEffect(() => {
    if (!token || !ownerId) {
      runtime.current = null;
      return;
    }
    let alive = true;
    let acting = false;
    let storageMayBeEvicted = true;
    let currentRecord: RetainedUpload | undefined;
    let active: { controller: AbortController; operation: ReturnType<typeof runRetainedUpload> } | null = null;
    const lifetime = new AbortController();
    const publish = (next: Omit<RetainedUploadView, "ownerId">) => {
      if (next.record) currentRecord = next.record;
      if (next.phase === "idle" || next.phase === "complete" || next.phase === "saving" ||
          (next.phase === "error" && !next.record)) currentRecord = undefined;
      if (alive && !lifetime.signal.aborted) setView({ ownerId, ...next });
    };
    const report = (error: unknown, record?: RetainedUpload) => {
      if (!alive || error instanceof SessionExpiredError) return;
      publish({
        phase: "error", record,
        message: error instanceof Error ? error.message : "The upload could not be completed.",
      });
    };
    const completed = () => {
      if (!alive || lifetime.signal.aborted) return;
      publish({ phase: "complete" });
      callbacks.current.onCompleted();
    };
    const cleanupInvalid = async (record: RetainedUpload) => {
      acting = true;
      try {
        const result = await cancelRetainedUploadWithRetry(ownerId, token, lifetime.signal, record.clientUploadId);
        if (result.state !== "cancelled")
          throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The server completed an upload that was reported invalid.");
        publish({ phase: "error", message: "The uploaded workbook is invalid or contains no worksheets." });
      } catch (error) {
        report(error, record);
      } finally {
        acting = false;
      }
    };
    const launch = (record: RetainedUpload) => {
      if (!alive || lifetime.signal.aborted || active) return;
      const controller = new AbortController();
      const abort = () => controller.abort();
      lifetime.signal.addEventListener("abort", abort, { once: true });
      publish({ phase: "transferring", record, storageMayBeEvicted,
        progress: { state: "transferring", confirmedBytes: record.confirmedBytes, fileSize: record.fileSize } });
      const operation = runRetainedUpload(ownerId, token, controller.signal, (progress) => {
        if (!acting) publish({ phase: progress.state, record, progress, storageMayBeEvicted });
      });
      const task = { controller, operation };
      active = task;
      void operation.then(async (result) => {
        if (!alive || acting) return;
        if (result.state === "completed") completed();
        else if (result.state === "paused") publish({ phase: "paused", record: result.record, storageMayBeEvicted });
        else if (result.session?.status === "FAILED") await cleanupInvalid(result.record);
        else report(new Error("The upload is not ready to complete."), result.record);
      }).catch(async (error: unknown) => {
        if (!alive || acting) return;
        if (error instanceof UploadSessionApiError && error.code === "UPLOAD_INVALID_WORKBOOK") {
          await cleanupInvalid(record);
        } else if (error instanceof DOMException && error.name === "AbortError") {
          try {
            const latest = await loadRetainedUpload(ownerId);
            if (latest.paused) publish({ phase: "paused", record: latest, storageMayBeEvicted });
            else report(error, latest);
          } catch (reason) { report(reason); }
        } else if (error instanceof RetentionError && error.code === "UPLOAD_NOT_FOUND") {
          report(error);
          if (!lifetime.signal.aborted) callbacks.current.onCompleted();
        } else report(error, record);
      }).finally(() => {
        lifetime.signal.removeEventListener("abort", abort);
        if (active === task) active = null;
      });
    };
    runtime.current = {
      abort: () => { lifetime.abort(); active?.controller.abort(); },
      start: (file) => {
        if (acting || active) return;
        acting = true;
        publish({ phase: "saving" });
        void saveRetainedUpload({ ownerId, file, clientUploadId: crypto.randomUUID(), selectedAt: Date.now() })
          .then(({ record, persistent }) => {
            if (!alive || lifetime.signal.aborted) return;
            callbacks.current.onSaved();
            acting = false;
            storageMayBeEvicted = persistent !== true;
            launch(record);
          }).catch(async (error: unknown) => {
            if (error instanceof RetentionError && error.code === "UPLOAD_ALREADY_RETAINED") {
              try { report(error, await loadRetainedUpload(ownerId)); }
              catch (reason) { report(reason); }
            } else report(error, currentRecord);
          })
          .finally(() => { acting = false; });
      },
      pause: () => {
        if (acting || !active) return;
        acting = true;
        const task = active;
        publish({ phase: "pausing" });
        void loadRetainedUpload(ownerId).then(async (record) => {
          const paused = await pauseRetainedUploadAcrossTabs(ownerId, record.clientUploadId);
          task.controller.abort();
          const result = await task.operation.catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return null;
            throw error;
          });
          if (result?.state === "completed") completed();
          else publish({ phase: "paused", record: paused, storageMayBeEvicted });
        }).catch(async (error: unknown) => {
          if (error instanceof RetentionError && error.code === "UPLOAD_NOT_FOUND") {
            const result = await task.operation.catch(() => null);
            if (result?.state === "completed") return completed();
          }
          report(error, currentRecord);
        })
          .finally(() => { acting = false; });
      },
      resume: () => {
        if (acting || active) return;
        acting = true;
        void loadRetainedUpload(ownerId).then(async (record) => {
          const resumed = await updateRetainedUpload(ownerId, record.clientUploadId, { paused: false });
          acting = false;
          launch(resumed);
        }).catch((error: unknown) => report(error, currentRecord))
          .finally(() => { acting = false; });
      },
      cancel: () => {
        if (acting) return;
        acting = true;
        const task = active;
        publish({ phase: "cancelling" });
        void loadRetainedUpload(ownerId).then(async (record) => {
          const result = task
            ? await cancelActiveRetainedUpload(ownerId, token, record.clientUploadId, task.controller, task.operation, lifetime.signal)
            : await cancelRetainedUploadAcrossTabs(ownerId, token, record.clientUploadId, lifetime.signal);
          if (result.state === "completion-detected") {
            const resumed = await updateRetainedUpload(ownerId, record.clientUploadId, { paused: false });
            acting = false;
            launch(resumed);
          } else publish({ phase: "idle" });
        }).catch(async (error: unknown) => {
          if (task && error instanceof RetentionError && error.code === "UPLOAD_NOT_FOUND") {
            const result = await task.operation.catch(() => null);
            if (result?.state === "completed") return completed();
          }
          report(error, currentRecord);
        }).finally(() => { acting = false; });
      },
    };
    publish({ phase: "checking" });
    void loadRetainedUpload(ownerId).then((record) => {
      if (!alive) return;
      if (record.paused) publish({ phase: "paused", record, storageMayBeEvicted });
      else launch(record);
    }).catch((error: unknown) => {
      if (error instanceof RetentionError && error.code === "UPLOAD_NOT_FOUND")
        publish({ phase: "idle" });
      else report(error);
    });
    return () => {
      alive = false;
      lifetime.abort();
      active?.controller.abort();
      runtime.current = null;
    };
  }, [token, ownerId]);

  const current: RetainedUploadView = ownerId && view.ownerId === ownerId
    ? view : { ownerId: ownerId ?? "", phase: "checking" };
  return {
    view: current,
    start: (file: File) => runtime.current?.start(file),
    pause: () => runtime.current?.pause(),
    resume: () => runtime.current?.resume(),
    cancel: () => runtime.current?.cancel(),
    abort: () => runtime.current?.abort(),
  };
}
