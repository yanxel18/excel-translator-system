INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-cancellation-retry-v6',
  'Verify upload cancellation retry',
  'A browser test now verifies that cancellation can retry a lost server response while keeping the saved workbook until the server confirms cancellation. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T03:03:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
