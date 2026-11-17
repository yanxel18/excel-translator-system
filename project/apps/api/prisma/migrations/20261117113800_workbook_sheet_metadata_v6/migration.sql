ALTER TABLE "TranslationJob" ADD COLUMN "availableSheets" JSONB;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-workbook-sheet-metadata-v6',
  'Reduce workbook settings memory use',
  'New workbook jobs retain their worksheet list, so opening job details or changing settings no longer reloads the entire workbook just to find its sheets. Existing jobs remain compatible. The upload limit remains 50 MB while larger workbook processing is made safe.',
  '2026-11-17T11:38:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
