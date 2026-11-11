CREATE TABLE "OidcSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keycloakUrl" TEXT,
    "realm" TEXT,
    "clientId" TEXT,
    "issuerUrl" TEXT,
    "requiredGroup" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OidcSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt") VALUES
  (
    'changelog-20261111-admin-keycloak-settings',
    'Administrators can manage Keycloak sign-in',
    'Added an administrator-only Keycloak settings panel in Profile. Administrators can enable OIDC, set the provider and group requirement, and save changes to PostgreSQL; the API enforces administrator access.',
    '2026-11-11T14:35:00.000Z',
    '2026-11-11T14:35:00.000Z'
  );
