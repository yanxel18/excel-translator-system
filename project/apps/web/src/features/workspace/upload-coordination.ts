import { loadRetainedUpload, RetentionError, updateRetainedUpload, type RetainedUpload } from "./upload-retention";

export class UploadRequestTimeoutError extends Error {
  constructor() {
    super("The upload request timed out.");
    this.name = "UploadRequestTimeoutError";
  }
}

/** The controller must belong to this upload's active operation in this tab. */
export async function pauseRetainedUpload(
  ownerId: string,
  clientUploadId: string,
  activeController: AbortController,
): Promise<RetainedUpload> {
  const record = await updateRetainedUpload(ownerId, clientUploadId, { paused: true });
  activeController.abort();
  return record;
}

export async function withRetainedUploadLock<T>(
  ownerId: string,
  signal: AbortSignal | undefined,
  expectedClientUploadId: string | undefined,
  operation: (saved: RetainedUpload, signal: AbortSignal, setDeadline: (expiresAt: number) => void) => Promise<T>,
): Promise<T> {
  if (!navigator.locks)
    throw new RetentionError("UPLOAD_LOCK_UNAVAILABLE", "Browser upload coordination is unavailable.");
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const setDeadline = (expiresAt: number) => {
      clearTimeout(timer);
      timer = setTimeout(timeout, Math.max(0, Math.min(30_000, expiresAt - Date.now())));
    };
    setDeadline(saved.expiresAt);
    try {
      return await operation(saved, controller.signal, setDeadline);
    } catch (error) {
      if (timedOut && !signal?.aborted) throw new UploadRequestTimeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  });
}
