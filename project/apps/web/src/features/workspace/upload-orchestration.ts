import { completeRetainedUploadWithRetry, type UploadCompletionResult } from "./upload-completion";
import { removeRetainedUpload } from "./upload-retention";
import { transferRetainedUpload } from "./upload-sequential";

export type UploadProgress = {
  state: "transferring" | "validating" | "waiting-network" | "waiting-busy";
  confirmedBytes: number;
  fileSize: number;
};

/** Transfer the retained file, verify its job, and remove the browser copy only after success. */
export async function runRetainedUpload(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadCompletionResult> {
  const waiting = (reason: "network" | "busy", progress: { confirmedBytes: number; fileSize: number }) => {
    onProgress?.({ state: reason === "network" ? "waiting-network" : "waiting-busy", ...progress });
  };
  const transfer = await transferRetainedUpload(ownerId, token, signal, (progress) => {
    onProgress?.({ state: "transferring", ...progress });
  }, waiting);
  if (!transfer.session) return { state: "paused", record: transfer.record };
  if (!["RECEIVING", "FINALIZING", "COMPLETED"].includes(transfer.session.status) ||
      transfer.record.confirmedBytes !== transfer.record.fileSize)
    return { state: "not-ready", ...transfer };
  if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
  onProgress?.({
    state: "validating",
    confirmedBytes: transfer.record.confirmedBytes,
    fileSize: transfer.record.fileSize,
  });
  const completion = await completeRetainedUploadWithRetry(ownerId, token, signal, transfer.record.clientUploadId, waiting);
  if (completion.state !== "completed") return completion;
  if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
  await removeRetainedUpload(ownerId, completion.record.clientUploadId, completion.record);
  return completion;
}
