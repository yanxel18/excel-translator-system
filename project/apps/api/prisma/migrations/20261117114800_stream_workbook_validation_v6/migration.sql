INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-stream-workbook-validation-v6',
  'Reduce workbook validation memory use',
  'Translated workbooks now compare unchanged files in small streamed pieces instead of loading each complete file twice. Exact preservation checks remain in place. The upload limit remains 50 MB while larger workbook processing is made safe.',
  '2026-11-17T11:48:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
