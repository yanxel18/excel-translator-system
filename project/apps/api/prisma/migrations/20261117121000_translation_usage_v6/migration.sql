ALTER TABLE "TranslationJob"
  ADD COLUMN "inputCharacters" INTEGER,
  ADD COLUMN "outputCharacters" INTEGER,
  ADD COLUMN "inputTokensEstimate" INTEGER,
  ADD COLUMN "outputTokensEstimate" INTEGER;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-translation-usage-v6',
  'See translation character and token estimates',
  'Translation history now shows input and output character counts and estimated token equivalents. The profile dashboard summarizes completed translations. Estimates are based on text size, not actual model token usage. Older jobs do not have these measurements.',
  '2026-11-17T12:10:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
