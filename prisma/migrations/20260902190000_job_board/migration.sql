-- CreateEnum
CREATE TYPE "JobSourceType" AS ENUM ('greenhouse', 'lever', 'ashby', 'jsonld', 'custom');

-- CreateEnum
CREATE TYPE "JobSyncStatus" AS ENUM ('running', 'success', 'partial', 'failed');

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "companyLogoUrl" TEXT,
    "sourceType" "JobSourceType" NOT NULL,
    "boardToken" TEXT NOT NULL DEFAULT '',
    "careersUrl" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "crawlFrequencyMinutes" INTEGER NOT NULL DEFAULT 360,
    "lastCrawledAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogoUrl" TEXT,
    "descriptionHtml" TEXT NOT NULL DEFAULT '',
    "descriptionText" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "remoteType" TEXT,
    "employmentType" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "experienceLevel" TEXT,
    "category" TEXT,
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3),
    "updatedAtSource" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "applyUrl" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "JobSyncStatus" NOT NULL DEFAULT 'running',
    "jobsFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsInserted" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "jobsRejected" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSyncLock" (
    "id" TEXT NOT NULL,
    "owner" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "JobSyncLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_companySlug_key" ON "JobSource"("companySlug");

-- CreateIndex
CREATE INDEX "JobSource_enabled_priority_idx" ON "JobSource"("enabled", "priority");

-- CreateIndex
CREATE INDEX "JobSource_sourceType_idx" ON "JobSource"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_isActive_idx" ON "Job"("isActive");

-- CreateIndex
CREATE INDEX "Job_postedAt_idx" ON "Job"("postedAt");

-- CreateIndex
CREATE INDEX "Job_relevanceScore_idx" ON "Job"("relevanceScore");

-- CreateIndex
CREATE INDEX "Job_companyName_idx" ON "Job"("companyName");

-- CreateIndex
CREATE INDEX "Job_category_idx" ON "Job"("category");

-- CreateIndex
CREATE INDEX "Job_remoteType_idx" ON "Job"("remoteType");

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");

-- CreateIndex
CREATE INDEX "Job_isActive_isDuplicate_relevanceScore_postedAt_idx" ON "Job"("isActive", "isDuplicate", "relevanceScore", "postedAt");

-- CreateIndex
CREATE INDEX "Job_slug_idx" ON "Job"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Job_sourceId_externalJobId_key" ON "Job"("sourceId", "externalJobId");

-- CreateIndex
CREATE INDEX "JobSyncRun_sourceId_startedAt_idx" ON "JobSyncRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "JobSyncRun_status_startedAt_idx" ON "JobSyncRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSyncRun" ADD CONSTRAINT "JobSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "JobSyncLock" ("id") VALUES ('global');
