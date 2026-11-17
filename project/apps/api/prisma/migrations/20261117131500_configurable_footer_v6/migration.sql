INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-configurable-footer-v6',
  'Configure the footer company name',
  'The footer now uses Rimuru Company by default. Operators can change the displayed company name through the frontend environment configuration.',
  '2026-11-17T13:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
