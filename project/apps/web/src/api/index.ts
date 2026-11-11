import { AuthenticationApi } from './authentication';
import { JobsApi } from './jobs';
import { NotificationsApi } from './notifications';
import { VocabularyApi } from './vocabulary';
import { HistoryApi } from './history';
import { AccountApi } from './account';

export const ApiService = { ...AuthenticationApi, ...JobsApi, ...VocabularyApi, ...NotificationsApi, ...HistoryApi, ...AccountApi };
export type { ChangelogEntry, ChangelogPage, HistoryPage, Job, JobNotification, Language, NotificationPage, OidcAdminSettings, OidcPublicConfig, UserProfile, VocabularyEntry, VocabularyGroup, WorkbookPreview } from './types';
export default ApiService;
