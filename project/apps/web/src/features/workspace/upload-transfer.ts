import { uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { assertMatchingUploadSession, reconcileRetainedUpload } from "./upload-reconciliation";
import { withRetainedUploadLock } from "./upload-coordination";
import {
  readRetainedChunk,
  RetentionError,
  updateRetainedUpload,
  type RetainedUpload,
} from "./upload-retention";

export { UploadRequestTimeoutError } from "./upload-coordination";

/** Performs at most one chunk write. Callers must reconcile again after any error. */
export async function transferRetainedChunk(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<{ record: RetainedUpload; session: UploadSession | null }> {
  return withRetainedUploadLock(ownerId, signal, expectedClientUploadId, async (saved, requestSignal, setDeadline) => {
    const current = await reconcileRetainedUpload(ownerId, token, requestSignal, saved.clientUploadId);
    if (!current.session || current.session.status !== "RECEIVING" ||
        current.record.confirmedBytes === current.record.fileSize) return current;

    setDeadline(current.record.expiresAt);
    const chunk = readRetainedChunk(current.record, current.session.nextChunkIndex);
    const response = await uploadSessionApi.putChunk(
      current.session.id, current.session.nextChunkIndex, chunk, token, requestSignal,
    );
    assertMatchingUploadSession(current.record, response);
    if (response.status !== "RECEIVING" ||
        response.bytesReceived !== current.record.confirmedBytes + chunk.size) {
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The server returned unexpected upload progress.");
    }
    const record = await updateRetainedUpload(ownerId, current.record.clientUploadId, {
      confirmedBytes: response.bytesReceived,
      expiresAt: Date.parse(response.expiresAt),
    }, current.record);
    return { record, session: record.paused ? null : response };
  }, true);
}
