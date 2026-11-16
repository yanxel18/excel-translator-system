INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-cross-tab-pause-v6',
  'Prepare upload pause across tabs',
  'The upload recovery foundation can now save a pause and signal another browser tab to interrupt its active upload request. Server progress is checked before work resumes. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T01:56:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
