ALTER TABLE "Notification" ADD COLUMN "eventKey" TEXT;

UPDATE "Notification"
SET "eventKey" = CASE
  WHEN "type" = 'JOB_QUEUED' AND "title" = 'Translation queued'
    AND "message" = 'Your workbook is ready to start.' THEN 'job.queued'
  WHEN "type" = 'JOB_COMPLETED' AND "title" = 'Translation complete'
    AND "message" = 'Your translated workbook is ready to download.' THEN 'job.completed'
END
WHERE ("type" = 'JOB_QUEUED' AND "title" = 'Translation queued' AND "message" = 'Your workbook is ready to start.')
   OR ("type" = 'JOB_COMPLETED' AND "title" = 'Translation complete' AND "message" = 'Your translated workbook is ready to download.');

UPDATE "Notification" AS n
SET "eventKey" = CASE
  WHEN n."type" = 'JOB_PROGRESS' AND n."title" = 'Translation started'
    AND n."message" = j."fileName" || ' is being translated.' THEN 'job.started'
  WHEN n."type" = 'JOB_FAILED' AND n."title" = 'Translation failed'
    AND n."message" = j."fileName" || ' could not be translated.' THEN 'job.failed'
  WHEN n."type" = 'JOB_FAILED' AND n."title" = 'Translation interrupted'
    AND n."message" = j."fileName" || ' can be retried after an API restart.' THEN 'job.interrupted'
  WHEN n."type" = 'JOB_CANCELLED' AND n."title" = 'Translation cancelled'
    AND n."message" = j."fileName" || ' was cancelled.' THEN 'job.cancelled'
END
FROM "TranslationJob" AS j
WHERE n."jobId" = j."id" AND n."userId" = j."ownerId" AND (
  (n."type" = 'JOB_PROGRESS' AND n."title" = 'Translation started' AND n."message" = j."fileName" || ' is being translated.')
  OR (n."type" = 'JOB_FAILED' AND n."title" = 'Translation failed' AND n."message" = j."fileName" || ' could not be translated.')
  OR (n."type" = 'JOB_FAILED' AND n."title" = 'Translation interrupted' AND n."message" = j."fileName" || ' can be retried after an API restart.')
  OR (n."type" = 'JOB_CANCELLED' AND n."title" = 'Translation cancelled' AND n."message" = j."fileName" || ' was cancelled.')
);

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261118-localized-notifications-v7',
  'Read notifications in your language',
  'Translation notifications now update when you switch between English, Japanese, and Chinese. Existing recognized notifications are included, while unfamiliar older messages remain readable.',
  '2026-11-17T15:20:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
