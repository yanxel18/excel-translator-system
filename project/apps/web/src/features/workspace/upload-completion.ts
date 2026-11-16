import { uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { withRetainedUploadLock } from "./upload-coordination";
import { reconcileRetainedUpload } from "./upload-reconciliation";
import { loadRetainedUpload, RetentionError, updateRetainedUpload, type RetainedUpload } from "./upload-retention";
import { retryable, uploadRetryDelay, waitForRetry } from "./upload-retry";

export type UploadCompletionResult =
  | { state: "paused"; record: RetainedUpload }
  | { state: "not-ready"; record: RetainedUpload; session: UploadSession | null }
  | { state: "completed"; record: RetainedUpload; jobId: string };

/** Reconciles and makes at most one completion request; errors can leave its outcome unknown. */
export async function completeRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<UploadCompletionResult> {
  return withRetainedUploadLock(ownerId, signal, expectedClientUploadId, async (saved, requestSignal, setDeadline) => {
    if (saved.paused) return { state: "paused", record: saved };
    if (!saved.serverSessionId) return { state: "not-ready", record: saved, session: null };
    const current = await reconcileRetainedUpload(ownerId, token, requestSignal, saved.clientUploadId);
    if (!current.session) return { state: "paused", record: current.record };
    if (!["RECEIVING", "FINALIZING", "COMPLETED"].includes(current.session.status) ||
        current.record.confirmedBytes !== current.record.fileSize)
      return { state: "not-ready", record: current.record, session: current.session };

    setDeadline(current.record.expiresAt);
    const job = await uploadSessionApi.complete(current.session.id, token, requestSignal);
    if (current.session.status === "COMPLETED" && current.session.jobId?.toLowerCase() !== job.id.toLowerCase())
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The completed upload returned a different job.");
    const record = await updateRetainedUpload(ownerId, current.record.clientUploadId, {}, current.record);
    return { state: "completed", record, jobId: job.id };
  }, true);
}

/** Reconciles every completion attempt, including after an unknown outcome. */
export async function completeRetainedUploadWithRetry(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<UploadCompletionResult> {
  const original = await loadRetainedUpload(ownerId);
  if (expectedClientUploadId && original.clientUploadId !== expectedClientUploadId)
    throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
    const current = await loadRetainedUpload(ownerId);
    if (current.clientUploadId !== original.clientUploadId)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
    if (current.paused) return { state: "paused", record: current };
    try {
      return await completeRetainedUpload(ownerId, token, signal, original.clientUploadId);
    } catch (error) {
      if (signal?.aborted || !retryable(error)) throw error;
      const latest = await loadRetainedUpload(ownerId);
      if (latest.clientUploadId !== original.clientUploadId)
        throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
      if (latest.paused) return { state: "paused", record: latest };
      const delay = uploadRetryDelay(error, ++failures, latest.expiresAt);
      if (delay === null) throw error;
      await waitForRetry(delay, signal);
    }
  }
}
