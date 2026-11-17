ALTER TABLE "ApplicationSettings"
  DROP CONSTRAINT "ApplicationSettings_maxUploadSizeMb_check",
  ADD CONSTRAINT "ApplicationSettings_maxUploadSizeMb_check"
    CHECK ("maxUploadSizeMb" BETWEEN 1 AND 200);

ALTER TABLE "ApplicationSettings" ALTER COLUMN "maxUploadSizeMb" SET DEFAULT 200;
UPDATE "ApplicationSettings" SET "maxUploadSizeMb" = 200
WHERE "id" = 'default' AND "maxUploadSizeMb" = 50;

ALTER TABLE "UploadSession"
  DROP CONSTRAINT "UploadSession_metadata_check",
  ADD CONSTRAINT "UploadSession_metadata_check" CHECK (
    "fileSize" BETWEEN 1 AND 209715200 AND "chunkSize" = 1048576
    AND char_length("fileName") BETWEEN 1 AND 255 AND "fileName" ~* '\.xlsx$'
    AND position('/' IN "fileName") = 0 AND position(chr(92) IN "fileName") = 0
    AND "fileName" !~ '[[:cntrl:]]'
    AND cardinality("chunkHashes") = (("fileSize" - 1) / "chunkSize") + 1
    AND upload_chunk_hashes_valid("chunkHashes")
    AND "expiresAt" = "createdAt" + INTERVAL '24 hours'
  );

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-upload-200mb-v6',
  'Upload workbooks up to 200 MB',
  'Workbook uploads and previews now accept files up to 200 MB. Existing 50 MB settings are raised to 200 MB; administrators can still choose a smaller limit. Large workbooks can take longer and require more memory, and archive safety limits still apply.',
  '2026-11-17T11:55:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
