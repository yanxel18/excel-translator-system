const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Job {
  id: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  fileName: string; progress: number; createdAt: string; updatedAt: string; error?: string; textCount?: number;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
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

export const ApiService = {
  login: (username: string, password: string) => request<{ access_token: string }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  }),
  getJobs: (token: string) => request<Job[]>('/jobs', {}, token),
  uploadFile: async (file: File, token: string) => {
    const form = new FormData(); form.append('file', file);
    return request<Job>('/upload', { method: 'POST', body: form }, token);
  },
  startTranslation: (id: string, token: string) => request<Job>(`/jobs/${encodeURIComponent(id)}/start`, { method: 'POST' }, token),
  retryJob: (id: string, token: string) => request<Job>(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }, token),
  cancelJob: (id: string, token: string) => request<Job>(`/jobs/${encodeURIComponent(id)}/cancel`, { method: 'PUT' }, token),
  downloadUrl: (id: string) => `${API_BASE_URL}/jobs/${encodeURIComponent(id)}/download`,
};

export default ApiService;
