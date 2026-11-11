import { request } from './client';
import { HistoryPage, WorkbookPreview } from './types';

export const HistoryApi = {
  getHistory: (token: string, page = 1) => request<HistoryPage>(`/history?page=${page}`, {}, token),
  getWorkbookPreview: (id: string, version: 'source' | 'translated', token: string) => request<WorkbookPreview>(`/jobs/${encodeURIComponent(id)}/preview?version=${version}`, {}, token),
  deleteHistoryItem: (id: string, token: string) => request<{ ok: boolean }>(`/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
};
