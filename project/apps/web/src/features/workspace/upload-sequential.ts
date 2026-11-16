import type { UploadSession } from "../../api/upload-sessions";
import { transferRetainedChunkWithRetry } from "./upload-retry";
import { loadRetainedUpload, RetentionError, type RetainedUpload } from "./upload-retention";

/** Sends the saved file's chunks without creating or deleting a translation job. */
export async function transferRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  onProgress?: (progress: { confirmedBytes: number; fileSize: number }) => void,
): Promise<{ record: RetainedUpload; session: UploadSession | null }> {
  const original = await loadRetainedUpload(ownerId);
  let previousBytes = -1;
  for (;;) {
    const result = await transferRetainedChunkWithRetry(ownerId, token, signal, original.clientUploadId);
    if (!result.session || result.session.status !== "RECEIVING") return result;
    if (result.record.confirmedBytes !== result.record.fileSize &&
        result.record.confirmedBytes <= previousBytes)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The upload server did not maintain confirmed progress.");
    onProgress?.({ confirmedBytes: result.record.confirmedBytes, fileSize: result.record.fileSize });
    if (result.record.confirmedBytes === result.record.fileSize) return result;
    previousBytes = result.record.confirmedBytes;
  }
}
