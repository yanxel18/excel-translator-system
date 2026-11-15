INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-browser-retention-v6',
  'Prepare browser storage for upload recovery',
  'The upload recovery foundation can now retain a workbook and its progress in browser storage, with account-scoped safeguards and clear storage errors. Automatic browser recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-15T23:30:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
