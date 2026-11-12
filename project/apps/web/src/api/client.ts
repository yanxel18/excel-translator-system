import { API_BASE_URL } from "../config/runtime-config";
import { beginTrackedRequest } from "./request-progress";

export const SESSION_EXPIRED_EVENT = "excel-translator:session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super("Your session has expired. Please sign in again.", 401);
    this.name = "SessionExpiredError";
  }
}

function bearerToken(
  input: RequestInfo | URL,
  init?: RequestInit,
): string | null {
  const headers =
    input instanceof Request ? new Headers(input.headers) : new Headers();
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const authorization = headers.get("Authorization");
  return authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

export async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { silent?: boolean },
): Promise<Response> {
  const finish = options?.silent ? undefined : beginTrackedRequest();
  try {
    const response = await fetch(input, init);
    const token = bearerToken(input, init);
    if (response.status === 401 && token) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { token } }),
        );
      }
      throw new SessionExpiredError();
    }
    return response;
  } finally {
    finish?.();
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
  options?: { silent?: boolean },
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await trackedFetch(
    `${API_BASE_URL}${path}`,
    { ...init, headers },
    { silent: options?.silent },
  );
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      /* response has no JSON body */
    }
    throw new ApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }
  return response.json();
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
