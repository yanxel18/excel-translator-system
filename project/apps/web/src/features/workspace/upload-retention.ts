const DATABASE_NAME = "excel-translator-upload-retention";
const STORE_NAME = "uploads";
const CHUNK_SIZE = 1024 * 1024;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RetentionErrorCode =
  | "UPLOAD_ALREADY_RETAINED"
  | "UPLOAD_INTENT_CONFLICT"
  | "UPLOAD_INVALID_METADATA"
  | "UPLOAD_EXPIRED"
  | "UPLOAD_NOT_FOUND"
  | "UPLOAD_STORAGE_QUOTA"
  | "UPLOAD_STORAGE_UNAVAILABLE"
  | "UPLOAD_STORAGE_INVALID"
  | "UPLOAD_TRANSFER_BUSY"
  | "UPLOAD_LOCK_UNAVAILABLE"
  | "UPLOAD_RETRY_DEADLINE";

export class RetentionError extends Error {
  constructor(readonly code: RetentionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RetentionError";
    if (options && "cause" in options) Object.defineProperty(this, "cause", { value: options.cause });
  }
}

export interface RetainedUpload {
  ownerId: string;
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  file: Blob;
  chunkSize: number;
  chunkHashes: string[];
  selectedAt: number;
  expiresAt: number;
  serverSessionId: string | null;
  confirmedBytes: number;
  paused: boolean;
}

export interface RetainUploadInput {
  ownerId: string;
  clientUploadId: string;
  file: File;
  selectedAt: number;
}

export interface RetainedUploadUpdate {
  serverSessionId?: string;
  confirmedBytes?: number;
  expiresAt?: number;
  paused?: boolean;
}

function failure(error: unknown): RetentionError {
  if (error instanceof RetentionError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return new RetentionError(
      "UPLOAD_STORAGE_QUOTA",
      "Not enough browser storage is available. Free space and retry.",
      { cause: error },
    );
  return new RetentionError(
    "UPLOAD_STORAGE_UNAVAILABLE",
    "Browser upload storage is unavailable. Check site storage settings and retry.",
    { cause: error },
  );
}

function invalid(): RetentionError {
  return new RetentionError("UPLOAD_INVALID_METADATA", "The upload file or recovery metadata is invalid.");
}

function expired(): RetentionError {
  return new RetentionError("UPLOAD_EXPIRED", "The saved upload expired. Select the file again.");
}

function missing(): RetentionError {
  return new RetentionError(
    "UPLOAD_NOT_FOUND",
    "The saved upload is missing or browser storage was cleared or evicted. Select the file again.",
  );
}

function validOwner(ownerId: string): boolean {
  return typeof ownerId === "string" && ownerId.length > 0 && ownerId.length <= 255 && ownerId.trim() === ownerId;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, 1);
    } catch (error) {
      reject(failure(error));
      return;
    }
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "ownerId" });
    };
    request.onblocked = () => {
      blocked = true;
      reject(failure(new Error("Browser upload storage upgrade is blocked by another tab.")));
    };
    request.onerror = () => reject(failure(request.error));
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, result: (value: T) => void, abort: (error: RetentionError) => void) => void,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = database.transaction(STORE_NAME, mode);
    } catch (error) {
      database.close();
      reject(failure(error));
      return;
    }
    let value: T;
    let reason: RetentionError | undefined;
    tx.oncomplete = () => {
      database.close();
      resolve(value);
    };
    tx.onabort = () => {
      database.close();
      reject(reason ?? failure(tx.error));
    };
    try {
      run(tx.objectStore(STORE_NAME), (next) => { value = next; }, (error) => {
        reason = error;
        tx.abort();
      });
    } catch (error) {
      reason = failure(error);
      tx.abort();
    }
  });
}

function isRetainedUpload(value: unknown): value is RetainedUpload {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<RetainedUpload>;
  return typeof item.ownerId === "string" && validOwner(item.ownerId) &&
    typeof item.clientUploadId === "string" && UUID.test(item.clientUploadId) &&
    typeof item.fileName === "string" && item.fileName.length <= 255 && /\.xlsx$/i.test(item.fileName) &&
    !/[\u0000-\u001f\u007f-\u009f/\\]/.test(item.fileName) &&
    Number.isSafeInteger(item.fileSize) && (item.fileSize ?? 0) > 0 &&
    item.file instanceof Blob && item.file.size === item.fileSize &&
    item.chunkSize === CHUNK_SIZE && Array.isArray(item.chunkHashes) &&
    item.chunkHashes.length === Math.ceil((item.fileSize ?? 0) / CHUNK_SIZE) &&
    item.chunkHashes.every((hash) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)) &&
    Number.isSafeInteger(item.selectedAt) && (item.selectedAt ?? 0) > 0 &&
    Number.isSafeInteger(item.expiresAt) && (item.expiresAt ?? 0) > (item.selectedAt ?? 0) &&
    (item.expiresAt ?? 0) <= (item.selectedAt ?? 0) + RETENTION_MS &&
    (item.serverSessionId === null || (typeof item.serverSessionId === "string" && UUID.test(item.serverSessionId))) &&
    Number.isSafeInteger(item.confirmedBytes) && (item.confirmedBytes ?? -1) >= 0 &&
    (item.confirmedBytes ?? 0) <= (item.fileSize ?? 0) &&
    ((item.confirmedBytes ?? 0) === 0 || item.serverSessionId !== null) &&
    ((item.confirmedBytes ?? 0) === item.fileSize || (item.confirmedBytes ?? 0) % CHUNK_SIZE === 0) &&
    typeof item.paused === "boolean";
}

function corrupt(): RetentionError {
  return new RetentionError("UPLOAD_STORAGE_INVALID", "Saved upload data is incomplete or invalid.");
}

export async function saveRetainedUpload(input: RetainUploadInput): Promise<{
  record: RetainedUpload;
  persistent: boolean | null;
}> {
  const { ownerId, clientUploadId, file, selectedAt } = input;
  if (!validOwner(ownerId) || typeof clientUploadId !== "string" || !UUID.test(clientUploadId) ||
      !(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.name.length > 255 ||
      /[\u0000-\u001f\u007f-\u009f/\\]/.test(file.name) ||
      !Number.isSafeInteger(file.size) || file.size < 1 ||
      !Number.isSafeInteger(selectedAt) || selectedAt < 1 || selectedAt > Date.now())
    throw invalid();
  if (selectedAt + RETENTION_MS <= Date.now()) throw expired();

  let persistent: boolean | null = null;
  const hashes: string[] = [];
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function")
      persistent = await navigator.storage.persist();
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const bytes = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      hashes.push(Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""));
    }
  } catch (error) {
    throw failure(error);
  }
  if (selectedAt + RETENTION_MS <= Date.now()) throw expired();
  const record: RetainedUpload = {
    ownerId,
    clientUploadId: clientUploadId.toLowerCase(),
    fileName: file.name,
    fileSize: file.size,
    file,
    chunkSize: CHUNK_SIZE,
    chunkHashes: hashes,
    selectedAt,
    expiresAt: selectedAt + RETENTION_MS,
    serverSessionId: null,
    confirmedBytes: 0,
    paused: false,
  };
  const saved = await transaction<RetainedUpload>("readwrite", (store, result, abort) => {
    const request = store.get(ownerId);
    request.onsuccess = () => {
      try {
        const current: unknown = request.result;
        if (current !== undefined) {
          if (!isRetainedUpload(current)) return abort(corrupt());
          if (current.expiresAt <= Date.now()) {
            if (current.clientUploadId === record.clientUploadId) return abort(expired());
            store.delete(ownerId);
          } else {
            if (current.clientUploadId !== record.clientUploadId)
              return abort(new RetentionError("UPLOAD_ALREADY_RETAINED", "Finish or cancel the account's saved upload first."));
            if (current.fileName !== record.fileName || current.fileSize !== record.fileSize ||
                current.selectedAt !== record.selectedAt || current.chunkHashes.some((hash, index) => hash !== record.chunkHashes[index]))
              return abort(new RetentionError("UPLOAD_INTENT_CONFLICT", "This upload intent belongs to different file metadata."));
            result(current);
            return;
          }
        }
        if (record.expiresAt <= Date.now()) return abort(expired());
        store.add(record);
        result(record);
      } catch (error) {
        abort(failure(error));
      }
    };
  });
  return { record: saved, persistent };
}

export async function loadRetainedUpload(ownerId: string): Promise<RetainedUpload> {
  if (!validOwner(ownerId)) throw invalid();
  const found = await transaction<RetainedUpload | "expired">("readwrite", (store, result, abort) => {
    const request = store.get(ownerId);
    request.onsuccess = () => {
      try {
        const current: unknown = request.result;
        if (current === undefined) return abort(missing());
        if (!isRetainedUpload(current)) return abort(corrupt());
        if (current.expiresAt <= Date.now()) {
          store.delete(ownerId);
          result("expired");
        } else result(current);
      } catch (error) {
        abort(failure(error));
      }
    };
  });
  if (found === "expired") throw expired();
  return found;
}

export function readRetainedChunk(record: RetainedUpload, index: number): Blob {
  if (!isRetainedUpload(record)) throw corrupt();
  if (record.expiresAt <= Date.now()) throw expired();
  if (!Number.isSafeInteger(index) || index < 0 || index >= record.chunkHashes.length) throw invalid();
  return record.file.slice(index * CHUNK_SIZE, Math.min((index + 1) * CHUNK_SIZE, record.fileSize));
}

export async function updateRetainedUpload(
  ownerId: string,
  clientUploadId: string,
  update: RetainedUploadUpdate,
  expected?: RetainedUpload,
): Promise<RetainedUpload> {
  if (!validOwner(ownerId) || typeof clientUploadId !== "string" || !UUID.test(clientUploadId) ||
      typeof update !== "object" || update === null ||
      Object.keys(update).some((key) => !["serverSessionId", "confirmedBytes", "expiresAt", "paused"].includes(key)) ||
      (update.serverSessionId !== undefined && (typeof update.serverSessionId !== "string" || !UUID.test(update.serverSessionId))) ||
      (update.confirmedBytes !== undefined && (!Number.isSafeInteger(update.confirmedBytes) || update.confirmedBytes < 0)) ||
      (update.expiresAt !== undefined && (!Number.isSafeInteger(update.expiresAt) || update.expiresAt < 1)) ||
      (update.paused !== undefined && typeof update.paused !== "boolean"))
    throw invalid();
  const updated = await transaction<RetainedUpload | "expired">("readwrite", (store, result, abort) => {
    const request = store.get(ownerId);
    request.onsuccess = () => {
      try {
        const current: unknown = request.result;
        if (current === undefined) return abort(missing());
        if (!isRetainedUpload(current)) return abort(corrupt());
        if (current.clientUploadId !== clientUploadId.toLowerCase())
          return abort(new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed."));
        if (expected && (
          current.ownerId !== expected.ownerId ||
          current.clientUploadId !== expected.clientUploadId ||
          current.fileName !== expected.fileName ||
          current.fileSize !== expected.fileSize ||
          current.selectedAt !== expected.selectedAt ||
          current.serverSessionId !== expected.serverSessionId ||
          current.confirmedBytes !== expected.confirmedBytes ||
          current.expiresAt !== expected.expiresAt ||
          current.chunkHashes.length !== expected.chunkHashes.length ||
          current.chunkHashes.some((hash, index) => hash !== expected.chunkHashes[index])
        ))
          return abort(new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload changed during reconciliation."));
        const sessionId = update.serverSessionId?.toLowerCase() ?? current.serverSessionId;
        if (current.serverSessionId && sessionId !== current.serverSessionId)
          return abort(new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload already belongs to another server session."));
        const confirmedBytes = update.confirmedBytes ?? current.confirmedBytes;
        if (confirmedBytes > current.fileSize ||
            (confirmedBytes > 0 && !sessionId) ||
            (confirmedBytes !== current.fileSize && confirmedBytes % CHUNK_SIZE !== 0))
          return abort(invalid());
        const expiresAt = Math.min(current.expiresAt, update.expiresAt ?? current.expiresAt);
        if (expiresAt <= Date.now()) {
          store.delete(ownerId);
          result("expired");
          return;
        }
        const next: RetainedUpload = {
          ...current,
          serverSessionId: sessionId,
          confirmedBytes,
          expiresAt,
          paused: update.paused ?? current.paused,
        };
        store.put(next);
        result(next);
      } catch (error) {
        abort(failure(error));
      }
    };
  });
  if (updated === "expired") throw expired();
  return updated;
}

export async function removeRetainedUpload(ownerId: string, clientUploadId: string): Promise<void> {
  if (!validOwner(ownerId) || typeof clientUploadId !== "string" || !UUID.test(clientUploadId)) throw invalid();
  await transaction<void>("readwrite", (store, result, abort) => {
    const request = store.get(ownerId);
    request.onsuccess = () => {
      try {
        const current: unknown = request.result;
        if (current === undefined) return abort(missing());
        if (!isRetainedUpload(current)) return abort(corrupt());
        if (current.clientUploadId !== clientUploadId.toLowerCase())
          return abort(new RetentionError("UPLOAD_INTENT_CONFLICT", "The saved upload has changed."));
        store.delete(ownerId);
        result(undefined);
      } catch (error) {
        abort(failure(error));
      }
    };
  });
}

export async function purgeExpiredRetainedUploads(): Promise<number> {
  return transaction<number>("readwrite", (store, result, abort) => {
    let removed = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      try {
        const cursor = request.result;
        if (!cursor) return result(removed);
        if (!isRetainedUpload(cursor.value)) return abort(corrupt());
        if (cursor.value.expiresAt <= Date.now()) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      } catch (error) {
        abort(failure(error));
      }
    };
  });
}
