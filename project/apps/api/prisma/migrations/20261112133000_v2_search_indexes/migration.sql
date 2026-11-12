CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "User_gid_trgm_idx"
ON "User" USING GIN ("gid" gin_trgm_ops);

CREATE INDEX "User_username_trgm_idx"
ON "User" USING GIN ("username" gin_trgm_ops);

CREATE INDEX "User_email_trgm_idx"
ON "User" USING GIN ("email" gin_trgm_ops);

CREATE INDEX "TranslationJob_fileName_trgm_idx"
ON "TranslationJob" USING GIN ("fileName" gin_trgm_ops);

DROP INDEX "TranslationJob_ownerId_createdAt_idx";

CREATE INDEX "TranslationJob_ownerId_createdAt_id_idx"
ON "TranslationJob" ("ownerId", "createdAt", "id");

CREATE INDEX "TranslationJob_owner_langs_created_id_idx"
ON "TranslationJob" ("ownerId", "sourceLanguage", "targetLanguage", "createdAt", "id");

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
    'changelog-20261112-v2-search-performance',
    'Speed up administration search',
    'Administrator user and translation-history searches now use query-specific database indexes for faster substring searches. Existing search fields and results are unchanged.',
    '2026-11-12T13:30:00.000Z',
    '2026-11-12T13:30:00.000Z'
);
