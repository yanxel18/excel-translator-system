BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE "UploadSession" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "UploadSession") THEN
    RAISE EXCEPTION 'Cannot remove upload storage with retained intents; drain and expire receipts first';
  END IF;
END;
$$;
DROP TABLE "UploadSession";
DROP FUNCTION enforce_upload_session_storage();
DROP FUNCTION upload_chunk_hashes_valid(TEXT[]);
DROP TABLE "UploadStorageBudget";
DROP FUNCTION guard_upload_storage_budget();
DROP TYPE "UploadSessionStatus";
-- Published changelog history is intentionally retained.
COMMIT;
