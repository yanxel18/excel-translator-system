INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-real-browser-recovery-v6',
  'Verify upload recovery against a real server',
  'A browser test now checks that a saved workbook can recover from lost upload and completion responses against an isolated server, without creating duplicate jobs. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T02:25:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
