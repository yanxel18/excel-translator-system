INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-api-restart-recovery-v6',
  'Verify upload recovery after server restart',
  'A browser test now checks that a saved workbook can continue after a lost upload response and a server restart, without selecting the file again or creating duplicate jobs. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T02:46:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
