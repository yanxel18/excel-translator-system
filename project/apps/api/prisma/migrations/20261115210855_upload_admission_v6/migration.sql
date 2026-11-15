INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt") VALUES (
  'changelog-20261115-upload-admission-v6',
  'Bound workbook uploads and recover aborted receives',
  'Only one workbook upload is received, validated and prepared as a job at a time. Overlapping uploads receive an explicit retryable busy response. Aborted receives release capacity, while validation already running keeps its reservation until it finishes. The 50 MB ceiling and administrator settings are retained; chunked automatic recovery and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T12:08:55.000Z'
);
