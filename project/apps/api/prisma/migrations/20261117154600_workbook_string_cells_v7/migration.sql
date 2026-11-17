INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261118-workbook-string-cells-v7',
  'Translate more workbook text cells',
  'Text stored in additional workbook cell formats is now translated instead of being skipped. Formulas and unselected sheets remain unchanged.',
  '2026-11-17T15:41:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
