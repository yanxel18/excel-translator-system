INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-stream-workbook-responses-v6',
  'Reduce workbook download memory use',
  'Workbook downloads and preview files now stream from storage instead of loading the entire file into server memory. The upload limit remains 50 MB while larger workbook processing is made safe.',
  '2026-11-16T06:32:24.382Z'
) ON CONFLICT ("id") DO NOTHING;
