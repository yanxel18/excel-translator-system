import { UploadNetworkError, UploadSessionApiError, type UploadSession } from "../../api/upload-sessions";
import { loadRetainedUpload, RetentionError, type RetainedUpload } from "./upload-retention";
import { transferRetainedChunk, UploadRequestTimeoutError } from "./upload-transfer";

export { UploadNetworkError, UploadRequestTimeoutError };

function retryable(error: unknown): boolean {
  const busy = error instanceof UploadSessionApiError && error.status === 409 &&
    (error.code === "UPLOAD_BUSY" || error.code === "UPLOAD_CAPACITY_BUSY");
  const gateway = error instanceof UploadSessionApiError && error.code === null &&
    [429, 502, 503, 504].includes(error.status);
  const competingTab = error instanceof RetentionError && error.code === "UPLOAD_TRANSFER_BUSY";
  return error instanceof UploadNetworkError || error instanceof UploadRequestTimeoutError ||
    busy || gateway || competingTab;
}

export function uploadRetryDelay(error: unknown, failures: number, expiresAt: number): number | null {
  if (!retryable(error)) return null;

  const step = (failures - 1) % 6;
  const base = step === 5 ? 30_000 : 1000 * 2 ** step;
  const jittered = step === 5 ? base : Math.ceil(base * (1 + Math.random() * 0.2));
  const retryAfter = error instanceof UploadSessionApiError ? error.retryAfterMs ?? 0 : 0;
  const delay = Math.max(jittered, retryAfter);
  if (delay >= expiresAt - Date.now()) {
    throw new RetentionError("UPLOAD_RETRY_DEADLINE", "The upload cannot be retried before its recovery deadline.", { cause: error });
  }
  return delay;
}

function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload interrupted.", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Upload interrupted.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Retries a single chunk; every attempt reconciles before sending bytes. */
export async function transferRetainedChunkWithRetry(
  ownerId: string,
  token: string,
  signal?: AbortSignal,
  expectedClientUploadId?: string,
): Promise<{ record: RetainedUpload; session: UploadSession | null }> {
  const original = await loadRetainedUpload(ownerId);
  if (expectedClientUploadId && original.clientUploadId !== expectedClientUploadId)
    throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
    const current = await loadRetainedUpload(ownerId);
    if (current.clientUploadId !== original.clientUploadId)
      throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
    if (current.paused) return { record: current, session: null };
    try {
      return await transferRetainedChunk(ownerId, token, signal, original.clientUploadId);
    } catch (error) {
      if (signal?.aborted || !retryable(error)) throw error;
      const latest = await loadRetainedUpload(ownerId);
      if (latest.clientUploadId !== original.clientUploadId)
        throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
      if (latest.paused) return { record: latest, session: null };
      const delay = uploadRetryDelay(error, ++failures, latest.expiresAt);
      if (delay === null) throw error;
      await waitForRetry(delay, signal);
    }
  }
}
