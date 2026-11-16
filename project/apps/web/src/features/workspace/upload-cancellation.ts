import { UploadSessionApiError, uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { withRetainedUploadLock } from "./upload-coordination";
import { assertMatchingUploadSession, reconcileRetainedUpload } from "./upload-reconciliation";
import { removeRetainedUpload, RetentionError, updateRetainedUpload } from "./upload-retention";

export type UploadCancellationResult =
  | { state: "cancelled" }
  | { state: "completion-detected"; session: UploadSession };

/** Reconciles and cancels once; a failed request must be reconciled again before cleanup. */
export async function cancelRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
): Promise<UploadCancellationResult> {
  return withRetainedUploadLock(ownerId, signal, undefined, async (saved, requestSignal, setDeadline) => {
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
