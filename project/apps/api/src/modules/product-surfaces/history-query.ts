import { BadRequestException } from "@nestjs/common";
import {
  choice,
  pageNumber,
  pageSize,
  strictObject,
  uuid,
} from "../../common/management-validation";

export const HISTORY_SORT_COLUMNS = [
  "fileName",
  "status",
  "fileSize",
  "sourceLanguage",
  "targetLanguage",
  "createdAt",
] as const;
export const HISTORY_LANGUAGES = ["ENGLISH", "JAPANESE", "CHINESE"] as const;

export type HistorySortColumn = (typeof HISTORY_SORT_COLUMNS)[number];
export type HistoryLanguage = (typeof HISTORY_LANGUAGES)[number];
export type HistoryQuery = {
  q?: string;
  sourceLanguage?: HistoryLanguage;
  targetLanguage?: HistoryLanguage;
  sort: HistorySortColumn;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
  cursor?: string;
};

const HISTORY_SEARCH_MAX_LENGTH = 200;

export function parseHistoryQuery(value: unknown): HistoryQuery {
  const input = strictObject(value, [
    "q",
    "sourceLanguage",
    "targetLanguage",
    "sort",
    "direction",
    "page",
    "pageSize",
    "cursor",
  ]);
  let q: string | undefined;
  if (input.q !== undefined) {
    if (
      typeof input.q !== "string" ||
      input.q.length > HISTORY_SEARCH_MAX_LENGTH
    ) {
      throw new BadRequestException("Invalid history search.");
    }
    q = input.q.trim() || undefined;
    if (q && q.length > HISTORY_SEARCH_MAX_LENGTH)
      throw new BadRequestException("Invalid history search.");
  }

  return {
    q,
    sourceLanguage:
      input.sourceLanguage === undefined
        ? undefined
        : choice(input.sourceLanguage, HISTORY_LANGUAGES, "source language"),
    targetLanguage:
      input.targetLanguage === undefined
        ? undefined
        : choice(input.targetLanguage, HISTORY_LANGUAGES, "target language"),
    sort:
      input.sort === undefined
        ? "createdAt"
        : choice(input.sort, HISTORY_SORT_COLUMNS, "history sort"),
    direction:
      input.direction === undefined
        ? "desc"
        : choice(
            input.direction,
            ["asc", "desc"] as const,
            "history direction",
          ),
    page: pageNumber(input.page, 1, 100000),
    pageSize: pageSize(input.pageSize, 10),
    cursor: input.cursor === undefined ? undefined : uuid(input.cursor),
  };
}
