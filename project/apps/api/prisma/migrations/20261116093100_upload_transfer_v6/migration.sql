INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-transfer-v6',
  'Prepare safer upload transfers',
  'The upload recovery foundation can now send a saved workbook one chunk at a time, checking server progress after interruptions and preventing competing tabs from sending simultaneously. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:31:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
