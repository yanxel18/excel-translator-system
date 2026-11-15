-- Keep nullable TEXT and every stored value; no casts, backfill, or truncation.
-- Source: https://www.postgresql.org/docs/16/functions-string.html
-- Source: https://www.postgresql.org/docs/16/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The ALTER lock blocks concurrent writes through preflight and validation.
ALTER TABLE "User"
  ADD CONSTRAINT "User_fullName_code_points_check"
  CHECK (char_length("fullName") <= 50) NOT VALID;

DO $$
DECLARE
  overlong_count bigint;
BEGIN
  SELECT count(*) INTO overlong_count FROM "User"
    WHERE char_length("fullName") > 50;
  IF overlong_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Full-name migration blocked: %s existing full name(s) exceed 50 Unicode code points. No names were changed. Review these records with their owners before retrying; do not truncate or discard names.',
        overlong_count
      );
  END IF;
END $$;

ALTER TABLE "User" VALIDATE CONSTRAINT "User_fullName_code_points_check";

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
  'changelog-20261115-full-name-storage-limit-v6',
  'Enforce the 50-character full-name limit',
  'Stored full names are limited to 50 Unicode characters. OIDC sign-in rejects longer provider names and asks you to shorten your provider profile name. Existing accounts and names are never truncated or silently discarded.',
  '2026-11-15T09:10:00.000Z',
  '2026-11-15T09:10:00.000Z'
);

COMMIT;
