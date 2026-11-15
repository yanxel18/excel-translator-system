BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE "UploadSessionStatus" AS ENUM ('RECEIVING', 'FINALIZING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');
CREATE TABLE "UploadStorageBudget" (
  "id" TEXT PRIMARY KEY DEFAULT 'default' CHECK ("id" = 'default'),
  "reservedBytes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "UploadStorageBudget_capacity_check" CHECK ("reservedBytes" BETWEEN 0 AND 1073741824)
);
INSERT INTO "UploadStorageBudget" ("id") VALUES ('default');

CREATE FUNCTION guard_upload_storage_budget() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Only the upload-session trigger may adjust reservations' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "UploadStorageBudget_managed_guard" BEFORE UPDATE OR DELETE ON "UploadStorageBudget"
FOR EACH ROW EXECUTE FUNCTION guard_upload_storage_budget();

CREATE FUNCTION upload_chunk_hashes_valid(hashes TEXT[]) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT array_ndims(hashes) = 1 AND array_lower(hashes, 1) = 1
    AND NOT EXISTS (SELECT 1 FROM unnest(hashes) AS hash WHERE hash IS NULL OR hash !~ '^[0-9a-f]{64}$');
$$;

CREATE TABLE "UploadSession" (
  "id" UUID PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "clientUploadId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "chunkHashes" TEXT[] NOT NULL,
  "chunkSize" INTEGER NOT NULL DEFAULT 1048576,
  "bytesReceived" INTEGER NOT NULL DEFAULT 0,
  "nextChunkIndex" INTEGER NOT NULL DEFAULT 0,
  "status" "UploadSessionStatus" NOT NULL DEFAULT 'RECEIVING',
  "reservedBytes" INTEGER NOT NULL,
  "completionJobId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  "completedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "UploadSession_metadata_check" CHECK (
    "fileSize" BETWEEN 1 AND 52428800 AND "chunkSize" = 1048576
    AND char_length("fileName") BETWEEN 1 AND 255 AND "fileName" ~* '\.xlsx$'
    AND position('/' IN "fileName") = 0 AND position(chr(92) IN "fileName") = 0
    AND "fileName" !~ '[[:cntrl:]]'
    AND cardinality("chunkHashes") = (("fileSize" - 1) / "chunkSize") + 1
    AND upload_chunk_hashes_valid("chunkHashes")
    AND "expiresAt" = "createdAt" + INTERVAL '24 hours'
  ),
  CONSTRAINT "UploadSession_progress_check" CHECK (
    "nextChunkIndex" BETWEEN 0 AND cardinality("chunkHashes")
    AND "bytesReceived" = least("fileSize", "nextChunkIndex" * "chunkSize")
    AND ("status" NOT IN ('FINALIZING', 'COMPLETED') OR "bytesReceived" = "fileSize")
    AND (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL))
  ),
  CONSTRAINT "UploadSession_reservation_check" CHECK (
    "reservedBytes" IN (0, "fileSize")
    AND ("status" NOT IN ('RECEIVING', 'FINALIZING') OR "reservedBytes" = "fileSize")
  )
);
CREATE UNIQUE INDEX "UploadSession_ownerId_clientUploadId_key" ON "UploadSession" ("ownerId", "clientUploadId");
CREATE UNIQUE INDEX "UploadSession_completionJobId_key" ON "UploadSession" ("completionJobId");
CREATE UNIQUE INDEX "UploadSession_unfinished_owner_key" ON "UploadSession" ("ownerId")
  WHERE "status" IN ('RECEIVING', 'FINALIZING') OR "reservedBytes" > 0;
CREATE INDEX "UploadSession_expiresAt_idx" ON "UploadSession" ("expiresAt");

CREATE FUNCTION enforce_upload_session_storage() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."reservedBytes" <> 0 THEN
      RAISE EXCEPTION 'Upload bytes must be cleaned before deleting their reservation' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."id", NEW."ownerId", NEW."clientUploadId", NEW."fileName", NEW."fileSize",
      NEW."chunkHashes", NEW."chunkSize", NEW."completionJobId", NEW."createdAt", NEW."expiresAt")
      IS DISTINCT FROM ROW(OLD."id", OLD."ownerId", OLD."clientUploadId", OLD."fileName", OLD."fileSize",
      OLD."chunkHashes", OLD."chunkSize", OLD."completionJobId", OLD."createdAt", OLD."expiresAt")
      OR NEW."nextChunkIndex" < OLD."nextChunkIndex" OR NEW."reservedBytes" > OLD."reservedBytes"
      OR (OLD."status" NOT IN ('RECEIVING', 'FINALIZING')
        AND ROW(NEW."status", NEW."bytesReceived", NEW."nextChunkIndex", NEW."completedAt")
        IS DISTINCT FROM ROW(OLD."status", OLD."bytesReceived", OLD."nextChunkIndex", OLD."completedAt"))
      OR (NEW."status" <> OLD."status" AND NOT (
        (OLD."status" = 'RECEIVING' AND NEW."status" IN ('FINALIZING', 'CANCELLED', 'EXPIRED', 'FAILED'))
        OR (OLD."status" = 'FINALIZING' AND NEW."status" IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'))))
    THEN
      RAISE EXCEPTION 'Upload intent metadata, acknowledged progress and terminal receipts are immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."status" <> 'RECEIVING' OR NEW."nextChunkIndex" <> 0 OR NEW."bytesReceived" <> 0 THEN
      RAISE EXCEPTION 'New uploads must start with no acknowledged bytes' USING ERRCODE = '23514';
    END IF;
  END IF;
  -- The single row update serializes all reservations and rolls back with the session write.
  UPDATE "UploadStorageBudget" SET "reservedBytes" = "reservedBytes" + NEW."reservedBytes"
    - CASE WHEN TG_OP = 'UPDATE' THEN OLD."reservedBytes" ELSE 0 END WHERE "id" = 'default';
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload storage budget is missing'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "UploadSession_storage_guard" BEFORE INSERT OR UPDATE OR DELETE ON "UploadSession"
FOR EACH ROW EXECUTE FUNCTION enforce_upload_session_storage();

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES ('changelog-20261115-upload-session-storage-v6', 'Persist safe upload recovery reservations',
  'The upload recovery foundation now saves immutable file hashes, progress, a fixed 24-hour deadline and a stable completion identifier. Repeated requests reuse the same intent; concurrent requests cannot create multiple unfinished sessions per account or exceed the shared 1 GB temporary reservation budget. Existing accounts, administrator limits and legacy uploads are preserved. Chunk transfer, automatic browser recovery and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T12:55:00.000Z') ON CONFLICT ("id") DO NOTHING;
COMMIT;
