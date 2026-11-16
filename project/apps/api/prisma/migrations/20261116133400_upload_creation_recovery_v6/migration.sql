INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-creation-recovery-v6',
  'Verify recovery after upload setup interruption',
  'A browser test now checks that a lost upload setup response is retried using the same saved workbook and upload intent, producing one completed job. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T04:34:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
