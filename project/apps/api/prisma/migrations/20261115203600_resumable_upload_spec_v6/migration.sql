INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt") VALUES (
  'changelog-20261115-resumable-upload-spec-v6',
  'Specify automatic resumable workbook uploads',
  'The V6 upload specification now covers temporary browser file retention, chunked transfers and automatic recovery for 24 hours after refresh or browser restart. It defines retryable busy responses, ownership, expiry and storage-failure handling. The protocol awaits approval; resumable uploads and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T11:36:00.000Z'
);
