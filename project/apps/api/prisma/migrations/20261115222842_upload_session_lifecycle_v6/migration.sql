BEGIN;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261115-upload-session-lifecycle-v6',
  'Manage resumable upload sessions safely',
  'Authenticated upload-session creation, status and cancellation now expose only owned upload metadata. A fixed 24-hour recovery deadline is cleaned in bounded startup and periodic batches; storage removal or ownership failures retain the reservation. Cancellation is repeatable and completed job receipts remain intact. Existing 50 MB administrator limits and legacy uploads are preserved; chunk transfer, automatic browser resume and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T13:28:42.000Z'
) ON CONFLICT ("id") DO NOTHING;

COMMIT;
