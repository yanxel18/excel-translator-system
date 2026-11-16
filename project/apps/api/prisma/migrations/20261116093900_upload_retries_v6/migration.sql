INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-upload-retries-v6',
  'Prepare upload interruption retries',
  'The upload recovery foundation now waits between temporary failures, checks server progress before retrying and respects saved-upload deadlines and pauses. Automatic recovery and 200 MB uploads are not enabled yet; existing uploads are unchanged.',
  '2026-11-16T00:39:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
