INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-larger-status-chart-v7',
  'A clearer translation status chart',
  'The profile dashboard now shows a larger translation status donut, while keeping the status counts available beside it.',
  '2026-11-17T13:55:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
