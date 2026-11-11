INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt") VALUES
  (
    'changelog-20261110-foundation',
    'The translator platform takes shape',
    'Established the persistent platform foundation with PostgreSQL-backed accounts and translation jobs. Added local and OIDC authentication boundaries, secure workbook storage, and a durable job lifecycle.',
    '2026-11-10T09:00:00.000Z',
    '2026-11-10T09:00:00.000Z'
  ),
  (
    'changelog-20261110-translation-workflow',
    'Translation jobs become reliable',
    'Added persisted workbook settings, worksheet selection, language choices, retry-safe job claiming, lifecycle notifications, and recovery for jobs interrupted by an API restart.',
    '2026-11-10T12:00:00.000Z',
    '2026-11-10T12:00:00.000Z'
  ),
  (
    'changelog-20261110-vocabulary',
    'Protect the terms that matter',
    'Added vocabulary groups and protected translations for supported language pairs. Choose worksheets and compatible vocabulary before starting a translation.',
    '2026-11-10T15:00:00.000Z',
    '2026-11-10T15:00:00.000Z'
  ),
  (
    'changelog-20261110-workbook-integrity',
    'More faithful workbook handling',
    'Hardened XLSX extraction and patching to preserve formulas, formatting, and shared strings. Added archive safety checks and structural validation before translated workbooks are published.',
    '2026-11-10T18:00:00.000Z',
    '2026-11-10T18:00:00.000Z'
  ),
  (
    'changelog-20261110-product-surfaces',
    'History, previews, and account tools arrive',
    'Added translation history with preview, download, and delete actions, along with profile editing, notifications, and the changelog. Application data surfaces support cursor pagination.',
    '2026-11-10T21:00:00.000Z',
    '2026-11-10T21:00:00.000Z'
  ),
  (
    'changelog-20261111-app-experience',
    'A complete workspace experience',
    'Introduced the Mantine application shell and workspace views for translation, history, vocabulary, notifications, and profile. Added saved English, Japanese, and Chinese preferences, light and dark themes, responsive layouts, and clearer loading and progress feedback.',
    '2026-11-11T09:00:00.000Z',
    '2026-11-11T09:00:00.000Z'
  ),
  (
    'changelog-20261111-deployment',
    'Ready for deployment and workbook review',
    'Added configurable /excel-convert deployment, persistent production services, focused tests, and an optional checksum-pinned ibisOffice preview integration for translated workbooks.',
    '2026-11-11T12:00:00.000Z',
    '2026-11-11T12:00:00.000Z'
  );
