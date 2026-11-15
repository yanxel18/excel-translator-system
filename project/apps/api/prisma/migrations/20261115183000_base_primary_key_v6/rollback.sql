-- Operator-only, not automatically executed by Prisma.
-- After COMMIT run the separate FK validation migration SQL again.
-- Preserve all rows, current acronym values and published changelog history.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE "Base", "User" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = '"Base"'::regclass
      AND conname = 'Base_pkey' AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (code)'
  ) THEN
    RAISE EXCEPTION 'Expected V6 Base.code primary key; stop and review schema drift.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = '"User"'::regclass
      AND conname = 'User_baseId_fkey' AND contype = 'f'
      AND confrelid = '"Base"'::regclass AND confdeltype = 'r' AND confupdtype = 'c'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = '"User"'::regclass AND attname = 'baseId')]
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = '"Base"'::regclass AND attname = 'id')]
  ) THEN
    RAISE EXCEPTION 'Expected UUID compatibility FK with RESTRICT/CASCADE; review schema drift before rollback.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE confrelid = '"Base"'::regclass
      AND contype = 'f'
      AND NOT (conrelid = '"User"'::regclass AND conname = 'User_baseId_fkey')
  ) THEN
    RAISE EXCEPTION 'Unexpected Base foreign key dependency; review before rollback.';
  END IF;
END $$;
CREATE UNIQUE INDEX "Base_code_key" ON "Base" ("code");
ALTER TABLE "User" DROP CONSTRAINT "User_baseId_fkey";
ALTER TABLE "Base" DROP CONSTRAINT "Base_pkey";
ALTER TABLE "Base" ADD CONSTRAINT "Base_pkey" PRIMARY KEY USING INDEX "Base_id_key";
ALTER TABLE "User" ADD CONSTRAINT "User_baseId_fkey"
  FOREIGN KEY ("baseId") REFERENCES "Base" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
DROP TRIGGER "Base_id_immutable" ON "Base";
DROP FUNCTION "v6_base_id_immutable"();
COMMIT;
