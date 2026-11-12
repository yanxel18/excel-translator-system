-- Existing accounts remain enabled and existing versionless sessions use version zero.
ALTER TABLE "User"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
