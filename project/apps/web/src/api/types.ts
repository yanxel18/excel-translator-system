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
