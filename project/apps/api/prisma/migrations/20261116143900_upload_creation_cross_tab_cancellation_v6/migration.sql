INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-creation-cross-tab-cancellation-v6',
  'Verify upload setup cancellation across tabs',
  'A browser test now verifies that cancelling upload setup from another tab interrupts the pending request and reconciles the existing session before removing the saved workbook. Automatic upload recovery and 200 MB uploads remain disabled; existing uploads are unchanged.',
  '2026-11-16T05:39:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
