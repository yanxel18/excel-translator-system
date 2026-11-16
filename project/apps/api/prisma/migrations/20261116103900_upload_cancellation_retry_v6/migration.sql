INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-cancellation-retry-v6',
  'Prepare safer upload cancellation retries',
  'The upload recovery foundation can now retry interrupted cancellations after checking server status, keeping saved workbooks until cleanup is confirmed and preserving completed jobs. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T01:39:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
