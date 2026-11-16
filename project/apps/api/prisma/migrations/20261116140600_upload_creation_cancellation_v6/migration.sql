INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-creation-cancellation-v6',
  'Verify cancellation during upload setup',
  'A browser test now verifies that cancelling while upload setup is still responding reconciles the existing session before removing the saved workbook. Automatic upload recovery and 200 MB uploads remain disabled; existing uploads are unchanged.',
  '2026-11-16T05:06:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
