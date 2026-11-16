INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-cancel-interrupt-v6',
  'Prepare cancellation during uploads',
  'The upload recovery foundation can now pause and interrupt an active request in the same browser tab before checking server status and cancelling safely. Completed jobs are preserved. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T01:50:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
