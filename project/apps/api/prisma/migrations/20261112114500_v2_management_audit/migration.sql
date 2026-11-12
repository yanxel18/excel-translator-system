CREATE TABLE "ManagementAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagementAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagementAudit_actorId_createdAt_idx" ON "ManagementAudit"("actorId", "createdAt");
CREATE INDEX "ManagementAudit_targetType_targetId_createdAt_idx" ON "ManagementAudit"("targetType", "targetId", "createdAt");

ALTER TABLE "ManagementAudit" ADD CONSTRAINT "ManagementAudit_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ChangelogEntry" ("id", "title", "details", "publishedAt", "createdAt")
VALUES (
    'changelog-20261112-v2-user-password-audit',
    'Manage accounts and review administrator changes',
    'Administrators can edit account details, enable or disable accounts, and reset local passwords. Local users can change their own passwords, and successful account, Base, and authentication-setting changes now produce redacted audit records.',
    '2026-11-12T11:45:00.000Z',
    '2026-11-12T11:45:00.000Z'
);
