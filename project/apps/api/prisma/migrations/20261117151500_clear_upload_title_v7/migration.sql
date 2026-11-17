INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261118-clear-upload-title-v7',
  'Clear completed upload and tab messages',
  'The upload banner now disappears after a successful upload, and completed translations no longer remain in the browser tab title. Daily usage details now include matching chart color and line indicators.',
  '2026-11-17T15:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
