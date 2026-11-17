INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-page-breadcrumbs-v7',
  'Find your way between pages',
  'Translate File, History, and System Settings now show breadcrumbs, with links back to relevant pages and localized labels.',
  '2026-11-17T13:45:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
