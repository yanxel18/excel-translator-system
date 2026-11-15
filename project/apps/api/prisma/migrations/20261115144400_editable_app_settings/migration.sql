CREATE TABLE "ApplicationSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "maxUploadSizeMb" INTEGER NOT NULL DEFAULT 50,
  "maxConcurrentTranslations" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicationSettings_id_check" CHECK ("id" = 'default'),
  CONSTRAINT "ApplicationSettings_maxUploadSizeMb_check" CHECK ("maxUploadSizeMb" BETWEEN 1 AND 50),
  CONSTRAINT "ApplicationSettings_maxConcurrentTranslations_check" CHECK ("maxConcurrentTranslations" BETWEEN 1 AND 5)
);

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
  'changelog-20261115-editable-app-settings-private-tailnet',
  'Set upload and translation limits, and browse privately with Tailscale',
  'Administrators can change workbook upload limits from 1 to 50 MB and simultaneous translations from 1 to 5; the System Settings label follows the selected language. Docker can optionally serve the app privately over Tailscale HTTPS with same-origin API and preview routes.',
  '2026-11-15T06:01:00.000Z',
  '2026-11-15T06:01:00.000Z'
);
