INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-active-cancel-v6',
  'Verify cancellation during an upload',
  'A browser test now checks that cancellation reconciles a committed upload chunk before removing the saved workbook and releasing server storage. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T03:19:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
