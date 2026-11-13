import { AuthenticationApi } from "./authentication";
import { JobsApi } from "./jobs";
import { NotificationsApi } from "./notifications";
import { VocabularyApi } from "./vocabulary";
import { HistoryApi } from "./history";
import { AccountApi } from "./account";
import { SystemInfoApi } from "./system-info";

export const ApiService = {
  ...AuthenticationApi,
  ...JobsApi,
  ...VocabularyApi,
  ...NotificationsApi,
  ...HistoryApi,
  ...AccountApi,
  ...SystemInfoApi,
};
export type {
  ChangelogEntry,
  ChangelogPage,
  HistoryPage,
  Job,
  JobNotification,
  Language,
  NotificationPage,
  OidcAdminSettings,
  OidcPublicConfig,
  UserProfile,
  VocabularyEntry,
  VocabularyGroup,
  WorkbookPreview,
  SystemInfo,
} from "./types";
export type { HistoryQuery, HistorySortColumn } from "./history";
export default ApiService;
