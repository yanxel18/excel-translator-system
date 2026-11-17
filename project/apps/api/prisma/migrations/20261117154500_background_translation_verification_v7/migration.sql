INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261118-background-translation-verification-v7',
  'Started translations continue in the background',
  'A started translation can finish after you sign out or close your browser, while the API stays running. Sign in again to see the result and notification.',
  '2026-11-17T15:45:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
