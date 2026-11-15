INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-chunk-review-pause-v6',
  'Save chunk uploads as a review draft',
  'Chunk upload development is saved for further review. Storage accounting, abort and storage error handling, parser behavior, and crash and expiry checks still need correction or verification. Existing 50 MB uploads remain available; automatic browser resume and 200 MB support are not enabled.',
  '2026-11-15T15:14:12.563Z'
) ON CONFLICT ("id") DO NOTHING;
