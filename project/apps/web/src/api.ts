const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/excel-convert';

export type Language = 'ENGLISH' | 'JAPANESE' | 'CHINESE';

export interface Job {
  id: string; status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  fileName: string; fileSize: number; progress: number; createdAt: string; updatedAt: string; completedAt?: string; elapsedMs?: number; error?: string; textCount?: number;
  selectedSheets: string[]; availableSheets: string[]; sourceLanguage: Language; targetLanguage: Language; vocabularyGroupId: string | null;
}

export interface VocabularyEntry {
  id: string; groupId: string; source: string; target: string; createdAt: string; updatedAt: string;
}

export interface VocabularyGroup {
  id: string; name: string; description: string | null; sourceLanguage: Language; targetLanguage: Language;
  createdAt: string; updatedAt: string; entries: VocabularyEntry[];
}

export interface JobNotification {
  id: string; jobId: string | null; type: string; title: string; message: string; isRead: boolean; createdAt: string;
}
export interface NotificationPage { data: JobNotification[]; nextCursor: string | null; }

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
  getJob: (id: string, token: string) => request<Job>(`/jobs/${encodeURIComponent(id)}`, {}, token),
  updateJobSettings: (id: string, settings: Pick<Job, 'selectedSheets' | 'sourceLanguage' | 'targetLanguage' | 'vocabularyGroupId'>, token: string) => request<Job>(`/jobs/${encodeURIComponent(id)}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }, token),
  getVocabularyGroups: (token: string) => request<VocabularyGroup[]>('/vocabulary', {}, token),
  createVocabularyGroup: (group: Pick<VocabularyGroup, 'name' | 'description' | 'sourceLanguage' | 'targetLanguage'>, token: string) => request<VocabularyGroup>('/vocabulary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(group) }, token),
  updateVocabularyGroup: (id: string, group: Partial<Pick<VocabularyGroup, 'name' | 'description' | 'sourceLanguage' | 'targetLanguage'>>, token: string) => request<VocabularyGroup>(`/vocabulary/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(group) }, token),
  deleteVocabularyGroup: (id: string, token: string) => request<{ ok: boolean }>(`/vocabulary/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
  createVocabularyEntry: (groupId: string, entry: Pick<VocabularyEntry, 'source' | 'target'>, token: string) => request<VocabularyEntry>(`/vocabulary/${encodeURIComponent(groupId)}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }, token),
  updateVocabularyEntry: (groupId: string, entryId: string, entry: Partial<Pick<VocabularyEntry, 'source' | 'target'>>, token: string) => request<VocabularyEntry>(`/vocabulary/${encodeURIComponent(groupId)}/entries/${encodeURIComponent(entryId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }, token),
  deleteVocabularyEntry: (groupId: string, entryId: string, token: string) => request<{ ok: boolean }>(`/vocabulary/${encodeURIComponent(groupId)}/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' }, token),
  getNotifications: (token: string, cursor?: string) => request<NotificationPage>(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {}, token),
  markNotificationRead: (id: string, token: string) => request<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }, token),
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
