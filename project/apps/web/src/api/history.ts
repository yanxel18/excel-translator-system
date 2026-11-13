import { request } from "./client";
import { HistoryPage, Language, WorkbookPreview } from "./types";

export type HistorySortColumn =
  | "fileName"
  | "status"
  | "fileSize"
  | "sourceLanguage"
  | "targetLanguage"
  | "createdAt";
export interface HistoryQuery {
  q?: string;
  sourceLanguage?: Language;
  targetLanguage?: Language;
  sort?: HistorySortColumn;
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: 10 | 20 | 30 | 40 | 50;
}

export const HistoryApi = {
  getHistory: (
    token: string,
    query: number | HistoryQuery = 1,
    signal?: AbortSignal,
    silent = false,
  ) => {
    const params = new URLSearchParams();
    const options = typeof query === "number" ? { page: query } : query;
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return request<HistoryPage>(
      `/history?${params.toString()}`,
      { signal },
      token,
      { silent },
    );
  },
  getWorkbookPreview: (
    id: string,
    version: "source" | "translated",
    token: string,
  ) =>
    request<WorkbookPreview>(
      `/jobs/${encodeURIComponent(id)}/preview?version=${version}`,
      {},
      token,
    ),
  deleteHistoryItem: (id: string, token: string) =>
    request<{ ok: boolean }>(
      `/jobs/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token,
    ),
};
