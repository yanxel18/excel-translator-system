import { request } from "./client";
import { VocabularyEntry, VocabularyGroup } from "./types";

export const VocabularyApi = {
  getVocabularyGroups: (token: string) =>
    request<VocabularyGroup[]>("/vocabulary", {}, token),
  createVocabularyGroup: (
    group: Pick<
      VocabularyGroup,
      "name" | "description" | "sourceLanguage" | "targetLanguage"
    >,
    token: string,
  ) =>
    request<VocabularyGroup>(
      "/vocabulary",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(group),
      },
      token,
    ),
  updateVocabularyGroup: (
    id: string,
    group: Partial<
      Pick<
        VocabularyGroup,
        "name" | "description" | "sourceLanguage" | "targetLanguage"
      >
    >,
    token: string,
  ) =>
    request<VocabularyGroup>(
      `/vocabulary/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(group),
      },
      token,
    ),
  deleteVocabularyGroup: (id: string, token: string) =>
    request<{ ok: boolean }>(
      `/vocabulary/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      token,
    ),
  createVocabularyEntry: (
    groupId: string,
    entry: Pick<VocabularyEntry, "source" | "target">,
    token: string,
  ) =>
    request<VocabularyEntry>(
      `/vocabulary/${encodeURIComponent(groupId)}/entries`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      },
      token,
    ),
  updateVocabularyEntry: (
    groupId: string,
    entryId: string,
    entry: Partial<Pick<VocabularyEntry, "source" | "target">>,
    token: string,
  ) =>
    request<VocabularyEntry>(
      `/vocabulary/${encodeURIComponent(groupId)}/entries/${encodeURIComponent(entryId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      },
      token,
    ),
  deleteVocabularyEntry: (groupId: string, entryId: string, token: string) =>
    request<{ ok: boolean }>(
      `/vocabulary/${encodeURIComponent(groupId)}/entries/${encodeURIComponent(entryId)}`,
      { method: "DELETE" },
      token,
    ),
};
