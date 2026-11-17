INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt")
VALUES (
  'changelog-20261117-browser-title-alerts-v7',
  'See translation updates in the browser tab',
  'The browser tab now shows the current page, translation status, and unread notification count in your selected language. While the tab is away, completed or failed translations can briefly draw attention; reduced-motion settings are respected.',
  '2026-11-17T14:20:00.000Z'
) ON CONFLICT ("id") DO NOTHING;
