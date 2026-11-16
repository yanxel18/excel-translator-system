INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-sequential-upload-v6',
  'Prepare sequential upload recovery',
  'The upload recovery foundation can now transfer a saved workbook in order, resume after interrupted acknowledgements and stop when an upload is paused or replaced. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:43:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
