INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-cancellation-recovery-v6',
  'Verify safer upload cancellation',
  'A browser test now checks that a saved workbook is kept after a lost cancellation response and removed only after the server confirms cancellation. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T02:54:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
