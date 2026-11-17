INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-history-table-layout-v7',
  'More room for translation history',
  'Search is now inside the history table, with the result count beside the pagination controls. The table has more room and remains usable on small screens.',
  '2026-11-17T13:50:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
