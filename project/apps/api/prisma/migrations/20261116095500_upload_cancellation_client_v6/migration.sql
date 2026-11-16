INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-cancellation-client-v6',
  'Prepare safer upload cancellation',
  'The upload recovery foundation can now reconcile an interrupted cancellation before removing its saved workbook, while preserving completed translation jobs. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:55:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
