INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261118-usage-chart-details-v7',
  'Explore daily usage and token examples',
  'Hover, focus, or tap a day in the usage chart to see its input and output character counts and estimated tokens. The token guide now displays its examples in highlighted blocks.',
  '2026-11-17T15:05:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
