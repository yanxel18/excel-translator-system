import { apiUrl, request } from "./client";
import { Job } from "./types";

export const JobsApi = {
  getJobs: (token: string, silent = false) =>
    request<Job[]>("/jobs", {}, token, { silent }),
  getJob: (id: string, token: string) =>
    request<Job>(`/jobs/${encodeURIComponent(id)}`, {}, token),
  updateJobSettings: (
    id: string,
    settings: Pick<
      Job,
      | "selectedSheets"
      | "sourceLanguage"
      | "targetLanguage"
      | "vocabularyGroupId"
    >,
    token: string,
  ) =>
    request<Job>(
      `/jobs/${encodeURIComponent(id)}/settings`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSheets: settings.selectedSheets,
          sourceLanguage: settings.sourceLanguage,
          targetLanguage: settings.targetLanguage,
          vocabularyGroupId: settings.vocabularyGroupId,
        }),
      },
      token,
    ),
  uploadFile: async (file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return request<Job>("/upload", { method: "POST", body: form }, token);
  },
  startTranslation: (id: string, token: string) =>
    request<Job>(
      `/jobs/${encodeURIComponent(id)}/start`,
      { method: "POST" },
      token,
    ),
  retryJob: (id: string, token: string) =>
    request<Job>(
      `/jobs/${encodeURIComponent(id)}/retry`,
      { method: "POST" },
      token,
    ),
  cancelJob: (id: string, token: string) =>
    request<Job>(
      `/jobs/${encodeURIComponent(id)}/cancel`,
      { method: "PUT" },
      token,
    ),
  downloadUrl: (id: string) =>
    apiUrl(`/jobs/${encodeURIComponent(id)}/download`),
};
