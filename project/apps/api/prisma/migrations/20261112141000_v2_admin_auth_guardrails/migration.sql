ALTER TABLE "UserIdentity"
ADD COLUMN "providerUsername" TEXT;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
    'changelog-20261112-v2-admin-auth-guardrails',
    'Protect configured administrator access',
    'OIDC administrator identity follows the provider username claim. Username edits cannot transfer local administrator access, and disabling an administrator requires another usable administrator login in the configured authentication mode.',
    '2026-11-12T14:10:00.000Z',
    '2026-11-12T14:10:00.000Z'
);
