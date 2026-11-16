INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-file-identity-v6',
  'Protect upload files from identity collisions',
  'Upload recovery now compares exact filesystem identities when checking or cleaning up a saved workbook, preventing another file from being mistaken for it. Automatic upload recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T03:40:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
