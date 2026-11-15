-- The full User scan must not hold the cutover's ACCESS EXCLUSIVE locks.
-- NOT VALID already enforces inserts/updates/deletes; validation proves old rows.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "User" VALIDATE CONSTRAINT "User_baseId_fkey";
COMMIT;
