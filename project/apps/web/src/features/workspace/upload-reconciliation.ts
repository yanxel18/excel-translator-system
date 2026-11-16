import { uploadSessionApi, type UploadSession } from "../../api/upload-sessions";
import {
  loadRetainedUpload,
  RetentionError,
  updateRetainedUpload,
  type RetainedUpload,
} from "./upload-retention";

/** Reconcile one saved intent; callers must supply the authenticated owner's ID. */
export async function reconcileRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ record: RetainedUpload; session: UploadSession | null }> {
  const record = await loadRetainedUpload(ownerId);
  if (record.paused) return { record, session: null };

  const input = {
    clientUploadId: record.clientUploadId,
    fileName: record.fileName,
    fileSize: record.fileSize,
    chunkHashes: record.chunkHashes,
  };
  const session = record.serverSessionId
    ? await uploadSessionApi.status(record.serverSessionId, token, signal)
    : await uploadSessionApi.create(input, token, signal);

  if (session.clientUploadId.toLowerCase() !== record.clientUploadId ||
      session.fileName !== record.fileName ||
      session.fileSize !== record.fileSize ||
      session.chunkSize !== record.chunkSize ||
      session.chunkHashes.length !== record.chunkHashes.length ||
      session.chunkHashes.some((hash, index) => hash !== record.chunkHashes[index])) {
    throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The server upload does not match the saved file.");
  }

  const updated = await updateRetainedUpload(ownerId, record.clientUploadId, {
    serverSessionId: session.id,
    confirmedBytes: session.bytesReceived,
    expiresAt: Date.parse(session.expiresAt),
  }, record);
  return { record: updated, session: updated.paused ? null : session };
}
