INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-cross-tab-cancel-v6',
  'Verify upload cancellation across tabs',
  'A browser test now checks that cancellation from another tab reconciles a committed upload chunk before removing the saved workbook and releasing server storage. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T03:36:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
