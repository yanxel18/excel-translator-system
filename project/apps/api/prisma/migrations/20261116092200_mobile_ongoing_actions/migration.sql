INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-mobile-ongoing-actions',
  'Improve mobile translation actions',
  'Settings, Start and other ongoing translation actions are now aligned to the right on smaller screens.',
  '2026-11-16T00:22:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
