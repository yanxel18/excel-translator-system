INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-completion-client-v6',
  'Prepare upload completion recovery',
  'The upload recovery foundation can now check an upload before requesting completion and recover a confirmed job after an interrupted response. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:49:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
