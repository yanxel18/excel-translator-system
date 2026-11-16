INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-resumable-upload-orchestration-v6',
  'Prepare resumable upload progress and completion',
  'Resumable upload development now combines confirmed transfer progress with job completion and removes the saved browser copy only after success. The upload controls and automatic recovery are not connected yet, and the 200 MB limit remains disabled.',
  '2026-11-16T05:50:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
