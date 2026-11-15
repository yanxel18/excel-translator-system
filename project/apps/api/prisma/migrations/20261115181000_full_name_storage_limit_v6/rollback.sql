-- Operator-only reversal; Prisma deploy executes migration.sql, not this file.
-- Preserve all account data and published changelog history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "User" DROP CONSTRAINT "User_fullName_code_points_check";
COMMIT;
