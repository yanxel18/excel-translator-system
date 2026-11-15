INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt") VALUES (
  'changelog-20261115-upload-proxy-v6',
  'Allow supported workbook uploads through the web proxy',
  'The web proxy now accepts workbook uploads up to the current 50 MB file ceiling instead of rejecting requests above 1 MB. Administrator limits and archive safety checks remain unchanged. The safe 200 MB rollout strategy is documented; that higher ceiling is not enabled yet.',
  '2026-11-15T11:08:00.000Z'
);
