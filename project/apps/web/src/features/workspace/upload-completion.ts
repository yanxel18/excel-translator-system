import { uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { withRetainedUploadLock } from "./upload-coordination";
import { reconcileRetainedUpload } from "./upload-reconciliation";
import { RetentionError, updateRetainedUpload, type RetainedUpload } from "./upload-retention";

export type UploadCompletionResult =
  | { state: "paused"; record: RetainedUpload }
  | { state: "not-ready"; record: RetainedUpload; session: UploadSession | null }
  | { state: "completed"; record: RetainedUpload; jobId: string };

/** Reconciles and makes at most one completion request; errors can leave its outcome unknown. */
export async function completeRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
): Promise<UploadCompletionResult> {
  return withRetainedUploadLock(ownerId, signal, undefined, async (saved, requestSignal, setDeadline) => {
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
  });
}
