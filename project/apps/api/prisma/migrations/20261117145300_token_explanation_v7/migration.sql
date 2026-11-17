INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-token-explanation-v7',
  'Learn how token estimates work',
  'Translation history now includes a localized guide to tokens, language and model differences, and how the app estimates input and output usage. Examples distinguish estimates from actual model counts.',
  '2026-11-17T14:53:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
