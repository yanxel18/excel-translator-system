CREATE TABLE "MaintenanceSchedule" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceSchedule_singleton_check" CHECK ("id" = 'default'),
    CONSTRAINT "MaintenanceSchedule_window_check" CHECK (
        ("enabled" = false AND "startsAt" IS NULL AND "endsAt" IS NULL)
        OR (
            "startsAt" IS NOT NULL
            AND "endsAt" IS NOT NULL
            AND "startsAt" < "endsAt"
        )
    )
);

INSERT INTO "MaintenanceSchedule" ("id", "enabled", "startsAt", "endsAt")
VALUES ('default', false, NULL, NULL);

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
  'changelog-20261115-maintenance-schedule',
  'Schedule maintenance notices',
  'Administrators can save one enabled or disabled maintenance schedule in UTC. Authenticated users can retrieve the notice only while its window is active, and app access remains available.',
  '2026-11-15T08:09:00.000Z',
  '2026-11-15T08:09:00.000Z'
);
