INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-blue-scrollbars-v7',
  'Blue scrollbars match the application',
  'Scrollbars now use the application blue in light and dark themes, while high-contrast mode keeps system colors.',
  '2026-11-17T14:00:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
