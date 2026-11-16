INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-pause-interrupt-v6',
  'Prepare safer upload pause',
  'The upload recovery foundation can now save a pause before interrupting an active request in the same browser tab, so recovery can check the server before resuming. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T01:45:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
