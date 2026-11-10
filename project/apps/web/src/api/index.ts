import { AuthenticationApi } from './authentication';
import { JobsApi } from './jobs';
import { NotificationsApi } from './notifications';
import { VocabularyApi } from './vocabulary';

export const ApiService = { ...AuthenticationApi, ...JobsApi, ...VocabularyApi, ...NotificationsApi };
export type { Job, JobNotification, Language, NotificationPage, VocabularyEntry, VocabularyGroup } from './types';
export default ApiService;
