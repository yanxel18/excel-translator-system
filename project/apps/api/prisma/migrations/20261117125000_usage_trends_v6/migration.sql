INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-usage-trends-v6',
  'Track translation usage over seven days',
  'The profile dashboard now combines daily character bars and estimated token lines in one seven-day chart, with four all-time usage cards and accessible daily details. History usage column headings now match the other headings.',
  '2026-11-17T12:50:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
