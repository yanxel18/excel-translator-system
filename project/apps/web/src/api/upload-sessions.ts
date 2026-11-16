import { apiUrl, ApiError, trackedFetch } from "./client";

export interface UploadSessionInput {
  clientUploadId: string;
  fileName: string;
  fileSize: number;
  chunkHashes: string[];
}

export interface UploadSession extends UploadSessionInput {
  id: string;
  chunkSize: number;
  status: "RECEIVING" | "FINALIZING" | "COMPLETED" | "CANCELLED" | "EXPIRED" | "FAILED";
  bytesReceived: number;
  nextChunkIndex: number;
  expiresAt: string;
  jobId: string | null;
}

export class UploadSessionApiError extends ApiError {
  constructor(message: string, status: number, readonly code: string | null, readonly retryAfterMs: number | null) {
    super(message, status);
    this.name = "UploadSessionApiError";
  }
}

export class UploadNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "UploadNetworkError";
    if (cause !== undefined) Object.defineProperty(this, "cause", { value: cause });
  }
}

function retryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function invalidResponse(): Error {
  return new Error("The upload server returned an invalid response.");
}

function sessionResponse(value: unknown, expected: { id?: string; input?: UploadSessionInput }): UploadSession {
  if (!value || typeof value !== "object") throw invalidResponse();
  const item = value as Record<string, unknown>;
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const statuses = ["RECEIVING", "FINALIZING", "COMPLETED", "CANCELLED", "EXPIRED", "FAILED"];
  const expectedInput = expected.input;
  if (typeof item.id !== "string" || !id.test(item.id) ||
      typeof item.clientUploadId !== "string" || !id.test(item.clientUploadId) ||
      typeof item.fileName !== "string" || !Number.isSafeInteger(item.fileSize) || Number(item.fileSize) < 1 ||
      item.chunkSize !== 1048576 || !Array.isArray(item.chunkHashes) ||
      item.chunkHashes.length !== Math.ceil(Number(item.fileSize) / 1048576) ||
      !item.chunkHashes.every((hash: unknown) => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)) ||
      typeof item.status !== "string" || !statuses.includes(item.status) ||
      !Number.isSafeInteger(item.bytesReceived) || Number(item.bytesReceived) < 0 ||
      Number(item.bytesReceived) > Number(item.fileSize) ||
      !Number.isSafeInteger(item.nextChunkIndex) ||
      Number(item.nextChunkIndex) !== Math.ceil(Number(item.bytesReceived) / 1048576) ||
      (Number(item.bytesReceived) !== Number(item.fileSize) && Number(item.bytesReceived) % 1048576 !== 0) ||
      typeof item.expiresAt !== "string" || !Number.isFinite(Date.parse(item.expiresAt)) ||
      (item.status === "COMPLETED"
        ? typeof item.jobId !== "string" || !id.test(item.jobId)
        : item.jobId !== null) ||
      (expected.id !== undefined && item.id.toLowerCase() !== expected.id.toLowerCase()) ||
      (expectedInput !== undefined &&
        (item.clientUploadId.toLowerCase() !== expectedInput.clientUploadId.toLowerCase() ||
         item.fileName !== expectedInput.fileName || item.fileSize !== expectedInput.fileSize ||
         item.chunkHashes.length !== expectedInput.chunkHashes.length ||
         item.chunkHashes.some((hash: string, index: number) => hash !== expectedInput.chunkHashes[index]))))
    throw invalidResponse();
  return value as UploadSession;
}

async function uploadRequest(path: string, token: string, init: RequestInit): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await trackedFetch(apiUrl(path), { ...init, headers });
  } catch (error) {
    if (error instanceof TypeError && !init.signal?.aborted)
      throw new UploadNetworkError("The upload server could not be reached.", error);
    throw error;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof TypeError) throw new UploadNetworkError("The upload response was interrupted.", error);
    if (response.ok) throw invalidResponse();
  }
  if (!response.ok) {
    const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const message = typeof data.message === "string" ? data.message : `Request failed (${response.status})`;
    throw new UploadSessionApiError(message, response.status,
      typeof data.code === "string" ? data.code : null, retryAfter(response.headers.get("Retry-After")));
  }
  return body;
}

function path(id: string): string {
  return `/upload-sessions/${encodeURIComponent(id)}`;
}

export const uploadSessionApi = {
  async create(input: UploadSessionInput, token: string, signal?: AbortSignal): Promise<UploadSession> {
    return sessionResponse(await uploadRequest("/upload-sessions", token, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
    }), { input });
  },
  async status(id: string, token: string, signal?: AbortSignal): Promise<UploadSession> {
    return sessionResponse(await uploadRequest(path(id), token, { signal }), { id });
  },
  async putChunk(id: string, index: number, chunk: Blob, token: string, signal?: AbortSignal): Promise<UploadSession> {
    return sessionResponse(await uploadRequest(`${path(id)}/chunks/${index}`, token, {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk, signal,
    }), { id });
  },
  async cancel(id: string, token: string, signal?: AbortSignal): Promise<UploadSession> {
    return sessionResponse(await uploadRequest(path(id), token, { method: "DELETE", signal }), { id });
  },
  async complete(id: string, token: string, signal?: AbortSignal): Promise<{ id: string }> {
    const value = await uploadRequest(`${path(id)}/completion`, token, { method: "POST", signal });
    if (!value || typeof value !== "object" || !("id" in value) ||
        typeof value.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id))
      throw invalidResponse();
    return { id: value.id };
  },
};
