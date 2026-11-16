INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-workspace-search-localization',
  'Improve workspace translations and search',
  'Ongoing translation details and dates now follow your selected language. The notification preview and user search have been simplified, and user search now has a clear button.',
  '2026-11-16T00:11:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
