-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ENGLISH', 'JAPANESE', 'CHINESE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('LOCAL', 'KEYCLOAK');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB_QUEUED', 'JOB_PROGRESS', 'JOB_COMPLETED', 'JOB_FAILED', 'JOB_CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT,
    "gid" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceLanguage" "Language" NOT NULL,
    "targetLanguage" "Language" NOT NULL,
    "selectedSheets" JSONB NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "outputPath" TEXT,
    "vocabularyGroupId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "textCount" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "elapsedMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSheet" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "textCount" INTEGER,

    CONSTRAINT "JobSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyGroup" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceLanguage" "Language" NOT NULL,
    "targetLanguage" "Language" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyEntry" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subject_key" ON "UserIdentity"("provider", "subject");

-- CreateIndex
CREATE INDEX "TranslationJob_ownerId_createdAt_idx" ON "TranslationJob"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationJob_ownerId_status_completedAt_idx" ON "TranslationJob"("ownerId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "TranslationJob_vocabularyGroupId_idx" ON "TranslationJob"("vocabularyGroupId");

-- CreateIndex
CREATE INDEX "JobSheet_jobId_isSelected_idx" ON "JobSheet"("jobId", "isSelected");

-- CreateIndex
CREATE UNIQUE INDEX "JobSheet_jobId_sheetName_key" ON "JobSheet"("jobId", "sheetName");

-- CreateIndex
CREATE INDEX "VocabularyGroup_ownerId_sourceLanguage_targetLanguage_idx" ON "VocabularyGroup"("ownerId", "sourceLanguage", "targetLanguage");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyGroup_ownerId_name_sourceLanguage_targetLanguage_key" ON "VocabularyGroup"("ownerId", "name", "sourceLanguage", "targetLanguage");

-- CreateIndex
CREATE INDEX "VocabularyEntry_groupId_idx" ON "VocabularyEntry"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_groupId_source_key" ON "VocabularyEntry"("groupId", "source");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_jobId_idx" ON "Notification"("jobId");

-- CreateIndex
CREATE INDEX "ChangelogEntry_publishedAt_idx" ON "ChangelogEntry"("publishedAt");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationJob" ADD CONSTRAINT "TranslationJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationJob" ADD CONSTRAINT "TranslationJob_vocabularyGroupId_fkey" FOREIGN KEY ("vocabularyGroupId") REFERENCES "VocabularyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSheet" ADD CONSTRAINT "JobSheet_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyGroup" ADD CONSTRAINT "VocabularyGroup_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyEntry" ADD CONSTRAINT "VocabularyEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "VocabularyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranslationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
