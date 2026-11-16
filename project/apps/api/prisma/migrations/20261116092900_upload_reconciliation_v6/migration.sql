INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-reconciliation-v6',
  'Prepare upload recovery checks',
  'The upload recovery foundation can now match a saved workbook with its server session and confirmed progress, while respecting a manual pause and avoiding stale progress updates. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:29:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
