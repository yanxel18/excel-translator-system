INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261116-resumable-upload-controls-v6',
  'Resume interrupted workbook uploads',
  'Workbook uploads now save a browser copy for recovery, resume automatically for the same signed-in account, and provide progress, pause, resume, and cancel controls. The 200 MB limit remains disabled while large-workbook processing and preview safety work is completed.',
  '2026-11-16T06:10:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
