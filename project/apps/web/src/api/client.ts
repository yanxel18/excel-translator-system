import { API_BASE_URL } from '../config/runtime-config';
import { beginTrackedRequest } from './request-progress';

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const finish = beginTrackedRequest();
  try {
    return await fetch(input, init);
  } finally {
    finish();
  }
}

export async function request<T>(path: string, init: RequestInit = {}, token?: string, options?: { silent?: boolean }): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await (options?.silent ? fetch : trackedFetch)(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json(); message = body.message || message; } catch { /* response has no JSON body */ }
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  return response.json();
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
