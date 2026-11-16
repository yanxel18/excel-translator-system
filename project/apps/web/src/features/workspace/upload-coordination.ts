import { loadRetainedUpload, RetentionError, updateRetainedUpload, type RetainedUpload } from "./upload-retention";

export class UploadRequestTimeoutError extends Error {
  constructor() {
    super("The upload request timed out.");
    this.name = "UploadRequestTimeoutError";
  }
}

function pauseChannel(ownerId: string): BroadcastChannel {
  try {
    return new BroadcastChannel(`excel-translator-upload-pause:${ownerId}`);
  } catch (error) {
    throw new RetentionError("UPLOAD_COORDINATION_UNAVAILABLE", "Browser upload coordination is unavailable.", { cause: error });
  }
}

/** Persist the pause before requesting interruption in other tabs. */
export async function pauseRetainedUploadAcrossTabs(
  ownerId: string,
  clientUploadId: string,
): Promise<RetainedUpload> {
  const channel = pauseChannel(ownerId);
  try {
    const record = await updateRetainedUpload(ownerId, clientUploadId, { paused: true });
    channel.postMessage({ clientUploadId: record.clientUploadId });
    return record;
  } finally {
    channel.close();
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
  interruptOnPause = false,
): Promise<T> {
  if (!navigator.locks)
    throw new RetentionError("UPLOAD_LOCK_UNAVAILABLE", "Browser upload coordination is unavailable.");
  return navigator.locks.request(`excel-translator-upload:${ownerId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new RetentionError("UPLOAD_TRANSFER_BUSY", "Another tab is transferring this upload.");
    if (signal?.aborted) throw new DOMException("Upload interrupted.", "AbortError");
    const controller = new AbortController();
    const channel = interruptOnPause ? pauseChannel(ownerId) : undefined;
    const savedPromise = loadRetainedUpload(ownerId);
    let active = true;
    let coordinationFailure: unknown;
    let coordinationFailed = false;
    if (channel) channel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null ||
          !("clientUploadId" in event.data) || typeof event.data.clientUploadId !== "string") return;
      const clientUploadId = event.data.clientUploadId;
      void (async () => {
        try {
          const saved = await savedPromise;
          if (clientUploadId !== saved.clientUploadId) return;
          const current = await loadRetainedUpload(ownerId);
          if (active && current.clientUploadId === saved.clientUploadId && current.paused) controller.abort();
        } catch (error) {
          if (active) {
            coordinationFailed = true;
            coordinationFailure = error;
            controller.abort();
          }
        }
      })();
    };
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
    try {
      const saved = await savedPromise;
      if (expectedClientUploadId && saved.clientUploadId !== expectedClientUploadId)
        throw new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed.");
      setDeadline(saved.expiresAt);
      const result = await operation(saved, controller.signal, setDeadline);
      if (coordinationFailed) throw coordinationFailure;
      return result;
    } catch (error) {
      if (coordinationFailed) throw coordinationFailure;
      if (timedOut && !signal?.aborted) throw new UploadRequestTimeoutError();
      throw error;
    } finally {
      active = false;
      channel?.close();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  });
}
