INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt") VALUES (
  'changelog-20261115-disk-upload-v6',
  'Receive workbooks safely on private disk storage',
  'Workbook uploads now use private disk storage with the administrator''s file-size limit enforced during reception. Validated files become jobs without retaining an in-memory receive buffer. Failed, oversized and interrupted temporary uploads are cleaned up, including after an API restart. Existing filenames, worksheet choices and the 50 MB ceiling are retained; automatic resumable uploads and the 200 MB ceiling are not enabled yet.',
  '2026-11-15T12:27:42.000Z'
);
