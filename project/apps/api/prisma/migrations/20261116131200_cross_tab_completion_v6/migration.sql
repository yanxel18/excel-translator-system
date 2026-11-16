INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-cross-tab-completion-v6',
  'Verify completed uploads across tabs',
  'A browser test now checks that cancellation from another tab preserves the saved workbook and completed job when the server finishes an upload before the completion response reaches the browser. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T04:12:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
