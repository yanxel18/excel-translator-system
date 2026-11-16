INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-cross-tab-cancel-v6',
  'Prepare upload cancellation across tabs',
  'The upload recovery foundation can now request an interruption in another browser tab and check server status before cancelling. Saved workbooks are kept until cancellation is confirmed, and completed jobs are preserved. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T02:06:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
