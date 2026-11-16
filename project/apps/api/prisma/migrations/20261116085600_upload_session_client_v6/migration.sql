INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-session-client-v6',
  'Prepare upload-session requests',
  'The upload recovery foundation now includes authenticated requests for creating, checking and completing upload sessions, sending chunks and cancelling sessions. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-15T23:56:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
