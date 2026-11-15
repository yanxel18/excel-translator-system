-- Atomic key cutover. Validate the rebound FK in the following migration,
-- outside this exclusive-lock transaction. No user-table scan or data rewrite.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE "Base", "User" IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  conflicts integer;
  id_att smallint;
  base_att smallint;
BEGIN
  SELECT attnum INTO id_att FROM pg_attribute
    WHERE attrelid = '"Base"'::regclass AND attname = 'id';
  SELECT attnum INTO base_att FROM pg_attribute
    WHERE attrelid = '"User"'::regclass AND attname = 'baseId';
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = '"Base"'::regclass
      AND conname = 'Base_pkey' AND contype = 'p' AND conkey = ARRAY[id_att]
  ) THEN
    RAISE EXCEPTION 'Expected prior Base.id primary key; stop and review schema drift.';
  END IF;
  -- A validated old FK proves historical integrity. Rebinding under both locks
  -- to the same unique values leaves no interval for an unprotected write.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = '"User"'::regclass
      AND conname = 'User_baseId_fkey' AND contype = 'f' AND convalidated
      AND confrelid = '"Base"'::regclass AND conkey = ARRAY[base_att]
      AND confkey = ARRAY[id_att] AND confdeltype = 'r' AND confupdtype = 'c'
  ) THEN
    RAISE EXCEPTION 'Expected validated User.baseId FK with RESTRICT/CASCADE; review schema drift.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE confrelid = '"Base"'::regclass
      AND contype = 'f'
      AND NOT (conrelid = '"User"'::regclass AND conname = 'User_baseId_fkey')
  ) THEN
    RAISE EXCEPTION 'Unexpected Base foreign key dependency; review every dependent reference before migration.';
  END IF;
  SELECT count(*) INTO conflicts FROM (
    SELECT upper("code") FROM "Base" GROUP BY upper("code") HAVING count(*) > 1
  ) duplicates;
  IF conflicts > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = format('%s conflicting factory acronym group(s); obtain approved remediation before retrying. No values changed.', conflicts);
  END IF;
  SELECT count(*) INTO conflicts FROM "Base"
    WHERE "code" IS NULL OR char_length("code") NOT BETWEEN 1 AND 32
      OR "code" !~ '^[A-Za-z0-9_-]+$';
  IF conflicts > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('%s invalid factory acronym(s); obtain approved remediation before retrying. No values changed.', conflicts);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index WHERE indrelid = '"Base"'::regclass
      AND indexrelid = to_regclass('"Base_code_key"')
      AND indisunique AND indisvalid AND indpred IS NULL AND indexprs IS NULL
      AND indnkeyatts = 1
      AND indkey[0] = (SELECT attnum FROM pg_attribute
        WHERE attrelid = '"Base"'::regclass AND attname = 'code')
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_index WHERE indrelid = '"Base"'::regclass
      AND indexrelid = to_regclass('"Base_code_case_insensitive_key"')
      AND indisunique AND indisvalid AND indpred IS NULL
      AND indnkeyatts = 1
      AND pg_get_expr(indexprs, indrelid) = 'upper(code)'
  ) THEN
    RAISE EXCEPTION 'Expected exact-code and case-insensitive unique indexes; stop and review schema drift.';
  END IF;
END $$;

-- Only the small Base catalogue is indexed under this bounded lock.
-- Retain the existing upper(code) uniqueness index without normalization.
CREATE UNIQUE INDEX "Base_id_key" ON "Base" ("id");
ALTER TABLE "User" DROP CONSTRAINT "User_baseId_fkey";
ALTER TABLE "Base" DROP CONSTRAINT "Base_pkey";
ALTER TABLE "Base" ADD CONSTRAINT "Base_pkey" PRIMARY KEY USING INDEX "Base_code_key";
ALTER TABLE "User" ADD CONSTRAINT "User_baseId_fkey"
  FOREIGN KEY ("baseId") REFERENCES "Base" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

CREATE FUNCTION "v6_base_id_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Base.id is an immutable UUID compatibility key; edit Base.code instead.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Base_id_immutable" BEFORE UPDATE OF "id" ON "Base"
  FOR EACH ROW EXECUTE FUNCTION "v6_base_id_immutable"();

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt") VALUES (
  'changelog-20261115-base-primary-key-v6',
  'Use factory acronyms as base primary keys',
  'Factory acronyms now identify bases in storage. Existing UUID-based API requests and user assignments remain compatible; editing an acronym preserves every assigned user and account identity. Duplicate acronyms and deletion of assigned bases remain blocked.',
  '2026-11-15T09:30:00.000Z'
);
COMMIT;
