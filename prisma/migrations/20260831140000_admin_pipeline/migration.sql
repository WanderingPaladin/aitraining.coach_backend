-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'REVIEWING', 'CONTACTED', 'DEMO_SCHEDULED', 'QUALIFIED', 'ONBOARDING', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('submitted', 'stage_changed', 'assignee_changed', 'note_added', 'tag_changed', 'demo_scheduled', 'demo_updated', 'archived', 'rejected', 'bulk_updated');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Application" ADD COLUMN "assignee" TEXT;
ALTER TABLE "Application" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Application" ADD COLUMN "nextActionAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "demoScheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApplicationNote" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationActivity" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "actor" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_pipelineStage_idx" ON "Application"("pipelineStage");
CREATE INDEX "Application_assignee_idx" ON "Application"("assignee");
CREATE INDEX "Application_createdAt_idx" ON "Application"("createdAt");
CREATE INDEX "ApplicationNote_applicationId_createdAt_idx" ON "ApplicationNote"("applicationId", "createdAt");
CREATE INDEX "ApplicationActivity_applicationId_createdAt_idx" ON "ApplicationActivity"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ApplicationNote" ADD CONSTRAINT "ApplicationNote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationActivity" ADD CONSTRAINT "ApplicationActivity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
