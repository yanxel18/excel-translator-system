import { UploadSessionApiError, uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { withRetainedUploadLock } from "./upload-coordination";
import { assertMatchingUploadSession, reconcileRetainedUpload } from "./upload-reconciliation";
import { loadRetainedUpload, removeRetainedUpload, RetentionError, updateRetainedUpload } from "./upload-retention";
import { retryable, uploadRetryDelay, waitForRetry } from "./upload-retry";

export type UploadCancellationResult =
  | { state: "cancelled" }
  | { state: "completion-detected"; session: UploadSession };

/** Reconciles and cancels once; a failed request must be reconciled again before cleanup. */
export async function cancelRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<UploadCancellationResult> {
  return withRetainedUploadLock(ownerId, signal, expectedClientUploadId, async (saved, requestSignal, setDeadline) => {
    let record = saved;
    try {
      const current = await reconcileRetainedUpload(ownerId, token, requestSignal, saved.clientUploadId, true);
      record = current.record;
      if (current.session?.status === "COMPLETED")
        return { state: "completion-detected", session: current.session };
    } catch (error) {
      if (!(error instanceof UploadSessionApiError) || !saved.serverSessionId ||
          !((error.status === 413 && error.code === "UPLOAD_LIMIT_CHANGED") ||
            (error.status === 410 && error.code === "UPLOAD_EXPIRED"))) throw error;
    }

    if (!record.serverSessionId)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The upload session could not be reconciled.");
    setDeadline(record.expiresAt);
    const response = await uploadSessionApi.cancel(record.serverSessionId, token, requestSignal);
    assertMatchingUploadSession(record, response);
    if (response.status === "COMPLETED") {
      await updateRetainedUpload(ownerId, record.clientUploadId, {}, record);
      return { state: "completion-detected", session: response };
    }
    if (!["CANCELLED", "EXPIRED", "FAILED"].includes(response.status))
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The server did not confirm upload cancellation.");
    await removeRetainedUpload(ownerId, record.clientUploadId, record);
    return { state: "cancelled" };
  });
}

/** Reconciles every cancellation attempt before removing the saved file. */
export async function cancelRetainedUploadWithRetry(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
): Promise<UploadCancellationResult> {
  const original = await loadRetainedUpload(ownerId);
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
    const current = await loadRetainedUpload(ownerId);
    if (current.clientUploadId !== original.clientUploadId)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
    try {
      return await cancelRetainedUpload(ownerId, token, signal, original.clientUploadId);
    } catch (error) {
      if (signal?.aborted || !retryable(error)) throw error;
      const latest = await loadRetainedUpload(ownerId);
      if (latest.clientUploadId !== original.clientUploadId)
        throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
      const delay = uploadRetryDelay(error, ++failures, latest.expiresAt);
      if (delay === null) throw error;
      await waitForRetry(delay, signal);
    }
  }
}
