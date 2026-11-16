INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-completion-cancel-race-v6',
  'Verify completed uploads survive cancellation',
  'A browser test now checks that a workbook and its completed job are preserved when completion wins a race with cancellation. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T03:10:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
