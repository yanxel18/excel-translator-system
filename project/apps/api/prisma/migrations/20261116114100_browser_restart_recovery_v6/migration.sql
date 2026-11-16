INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-browser-restart-recovery-v6',
  'Verify upload recovery after browser restart',
  'A browser test now verifies that a saved workbook can continue after a browser restart and a lost upload response, without selecting the file again or creating duplicate jobs. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T02:41:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
