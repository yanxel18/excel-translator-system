import { uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import { assertMatchingUploadSession, reconcileRetainedUpload } from "./upload-reconciliation";
import {
  loadRetainedUpload,
  readRetainedChunk,
  RetentionError,
  updateRetainedUpload,
  type RetainedUpload,
} from "./upload-retention";

export class UploadRequestTimeoutError extends Error {
  constructor() {
    super("The upload request timed out.");
    this.name = "UploadRequestTimeoutError";
  }
}

/** Performs at most one chunk write. Callers must reconcile again after any error. */
export async function transferRetainedChunk(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<{ record: RetainedUpload; session: UploadSession | null }> {
  if (!navigator.locks) {
    throw new RetentionError("UPLOAD_LOCK_UNAVAILABLE", "Browser upload coordination is unavailable.");
  }
  return navigator.locks.request(`excel-translator-upload:${ownerId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new RetentionError("UPLOAD_TRANSFER_BUSY", "Another tab is transferring this upload.");
    if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
    const saved = await loadRetainedUpload(ownerId);
    if (expectedClientUploadId && saved.clientUploadId !== expectedClientUploadId)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false;
    const timeout = () => { timedOut = true; controller.abort(); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    let timer = setTimeout(timeout, Math.max(0, Math.min(30_000, saved.expiresAt - Date.now())));
    try {
      const current = await reconcileRetainedUpload(ownerId, token, controller.signal, expectedClientUploadId);
      if (!current.session || current.session.status !== "RECEIVING" ||
          current.record.confirmedBytes === current.record.fileSize) return current;

      clearTimeout(timer);
      timer = setTimeout(timeout, Math.max(0, Math.min(30_000, current.record.expiresAt - Date.now())));
      const chunk = readRetainedChunk(current.record, current.session.nextChunkIndex);
      const response = await uploadSessionApi.putChunk(
        current.session.id, current.session.nextChunkIndex, chunk, token, controller.signal,
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
    } catch (error) {
      if (timedOut && !signal?.aborted) throw new UploadRequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  });
}
