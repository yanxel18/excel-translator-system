INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-completion-retry-v6',
  'Prepare safer upload completion retries',
  'The upload recovery foundation can now retry interrupted completion requests after checking the server, while respecting pauses and recovery deadlines. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T01:33:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
