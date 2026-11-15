INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-chunk-safety-v6',
  'Strengthen resumable upload chunk handling',
  'Upload chunks now use bounded memory instead of an extra temporary disk copy, accept correctly sized streamed requests, and preserve acknowledged data after interrupted writes. The web proxy returns busy responses without waiting for the entire chunk. Automatic browser resume, job completion and 200 MB uploads are not enabled yet.',
  '2026-11-15T22:49:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
