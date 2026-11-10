const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/excel-convert';

export async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
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
