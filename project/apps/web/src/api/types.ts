export type Language = 'ENGLISH' | 'JAPANESE' | 'CHINESE';

export interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  fileName: string;
  fileSize: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  elapsedMs?: number;
  error?: string;
  textCount?: number;
  selectedSheets: string[];
  availableSheets: string[];
  sourceLanguage: Language;
  targetLanguage: Language;
  vocabularyGroupId: string | null;
}

export interface VocabularyEntry {
  id: string;
  groupId: string;
  source: string;
  target: string;
  createdAt: string;
  updatedAt: string;
}

export interface VocabularyGroup {
  id: string;
  name: string;
  description: string | null;
  sourceLanguage: Language;
  targetLanguage: Language;
  createdAt: string;
  updatedAt: string;
  entries: VocabularyEntry[];
}

export interface JobNotification {
  id: string;
  jobId: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPage {
  data: JobNotification[];
  nextCursor: string | null;
}

export interface HistoryPage {
  data: Job[];
  nextCursor: string | null;
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkbookPreview {
  fileName: string;
  version: 'source' | 'translated';
  sheets: { name: string; rows: string[][] }[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  createdAt: string;
  isAdmin: boolean;
}

export interface OidcPublicConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
}

export interface OidcAdminSettings extends Omit<OidcPublicConfig, 'url'> {
  keycloakUrl: string;
  issuerUrl: string;
  requiredGroup: string;
}

export interface ChangelogEntry {
  id: string;
  title: string;
  details: string;
  publishedAt: string;
}

export interface ChangelogPage {
  data: ChangelogEntry[];
  nextCursor: string | null;
}
