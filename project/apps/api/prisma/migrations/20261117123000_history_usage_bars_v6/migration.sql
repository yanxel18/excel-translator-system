INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-history-usage-bars-v6',
  'Compare translation usage in history',
  'History now shows characters and estimated tokens in separate columns, with labeled input and output bars for each file. The usage text matches the rest of the table.',
  '2026-11-17T12:30:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
