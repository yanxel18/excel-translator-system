INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-session-completion-v6',
  'Complete resumable uploads safely',
  'Completed upload sessions now validate the workbook and create one translation job, even when a request or server restart interrupts completion. Retrying returns the same job; a deleted job is not recreated. Existing workbook safeguards and the 50 MB limit remain in place. Automatic browser recovery and 200 MB uploads are not enabled yet.',
  '2026-11-15T23:01:33.621Z'
) ON CONFLICT ("id") DO NOTHING;
