INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-parser-review-v6',
  'Improve upload request handling',
  'The upload draft now keeps raw chunk requests separate from GraphQL JSON parsing, while preserving cross-origin error responses and existing GraphQL and REST behavior. The remaining chunk safety checks are still in review; automatic browser resume and 200 MB uploads are not enabled.',
  '2026-11-15T22:35:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
