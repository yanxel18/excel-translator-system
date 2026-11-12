CREATE TYPE "AuthenticationMode" AS ENUM ('LOCAL', 'OIDC', 'HYBRID');

ALTER TABLE "OidcSettings"
ADD COLUMN "mode" "AuthenticationMode" NOT NULL DEFAULT 'LOCAL';

-- A previously enabled provider could coexist with local sign-in, so HYBRID
-- preserves both paths. Disabled providers leave the existing LOCAL path alone.
UPDATE "OidcSettings"
SET "mode" = CASE WHEN "enabled" THEN 'HYBRID'::"AuthenticationMode" ELSE 'LOCAL'::"AuthenticationMode" END;

ALTER TABLE "OidcSettings"
ADD CONSTRAINT "OidcSettings_mode_enabled_check"
CHECK ("enabled" = ("mode" <> 'LOCAL'));

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
    'changelog-20261112-v2-authentication-modes',
    'Choose an authentication mode with safer recovery',
    'Administrators can select LOCAL, OIDC, or HYBRID authentication from one persisted setting. Existing enabled Keycloak configurations migrate to HYBRID to preserve local and provider sign-in; unsafe issuer URLs are rejected, and deployment guidance documents administrator lockout recovery.',
    '2026-11-12T12:00:00.000Z',
    '2026-11-12T12:00:00.000Z'
);
