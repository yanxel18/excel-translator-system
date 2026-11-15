BEGIN;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261115-upload-chunk-receive-v6',
  'Receive verified upload chunks safely',
  'Authenticated upload sessions now accept ordered raw 1 MiB chunks with an exact shorter final chunk, verify SHA-256, and acknowledge only after synchronized private spool bytes and PostgreSQL progress are committed. Matching retries reconcile acknowledged bytes, while process restart recovery preserves committed data and discards only confirmed unacknowledged tails. Existing administrator choices and the 50 MB ceiling are preserved. Browser retention, automatic resume and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T14:11:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

COMMIT;
