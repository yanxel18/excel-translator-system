CREATE TABLE "Base" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Base_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Base_code_key" ON "Base"("code");
CREATE UNIQUE INDEX "Base_code_case_insensitive_key" ON "Base" (upper("code"));
INSERT INTO "Base" ("id", "code", "name") VALUES
  ('e1884c65-6fa9-4da6-9000-000000000001', 'JTY', 'JTY'),
  ('e1884c65-6fa9-4da6-9000-000000000002', 'KKTY', 'KKTY'),
  ('e1884c65-6fa9-4da6-9000-000000000003', 'CGTY', 'CGTY'),
  ('e1884c65-6fa9-4da6-9000-000000000004', 'MSTY', 'MSTY'),
  ('e1884c65-6fa9-4da6-9000-000000000005', 'PTY', 'PTY')
ON CONFLICT ("code") DO NOTHING;
ALTER TABLE "User" ADD COLUMN "baseId" TEXT;
CREATE INDEX "User_baseId_idx" ON "User"("baseId");
ALTER TABLE "User" ADD CONSTRAINT "User_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "gid" IS NOT NULL GROUP BY lower(trim("gid")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate GIDs after case-folding and trimming; resolve duplicates before migration.';
  END IF;
END $$;
CREATE UNIQUE INDEX "User_gid_normalized_key" ON "User" (lower(trim("gid"))) WHERE "gid" IS NOT NULL;
