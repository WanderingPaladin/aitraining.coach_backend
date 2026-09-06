-- CreateEnum
CREATE TYPE "JourneyStage" AS ENUM (
  'visitor',
  'application_started',
  'application_submitted',
  'intro_call_booked',
  'intro_call_attended',
  'coaching_started',
  'platform_applied',
  'platform_assessment',
  'platform_interview',
  'platform_interview_passed',
  'project_started',
  'inactive'
);

-- CreateEnum
CREATE TYPE "IntroCallAttendance" AS ENUM (
  'scheduled',
  'rescheduled',
  'cancelled',
  'attended',
  'no_show',
  'completed'
);

-- CreateEnum
CREATE TYPE "CandidateEventActor" AS ENUM ('system', 'candidate', 'admin');

-- CreateEnum
CREATE TYPE "PlatformProgressStatus" AS ENUM (
  'interested',
  'applied',
  'assessment_invited',
  'assessment_started',
  'assessment_completed',
  'interview_invited',
  'interview_scheduled',
  'interview_completed',
  'passed',
  'rejected',
  'waitlisted',
  'project_received',
  'working',
  'inactive'
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "landingPage" TEXT NOT NULL DEFAULT '/',
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "firstSource" TEXT NOT NULL DEFAULT 'direct',
    "lastLandingPage" TEXT,
    "lastReferrer" TEXT,
    "lastUtmSource" TEXT,
    "lastUtmMedium" TEXT,
    "lastUtmCampaign" TEXT,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorSession" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "landingPage" TEXT NOT NULL DEFAULT '/',
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "deviceType" TEXT,
    "browser" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "applicationId" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "bookingId" TEXT,
    "eventType" TEXT NOT NULL,
    "platform" TEXT,
    "opportunityId" TEXT,
    "metadata" JSONB,
    "pagePath" TEXT,
    "createdBy" "CandidateEventActor" NOT NULL DEFAULT 'system',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateOpportunity" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "opportunityId" TEXT,
    "opportunityTitle" TEXT,
    "status" "PlatformProgressStatus" NOT NULL DEFAULT 'interested',
    "appliedAt" TIMESTAMP(3),
    "assessmentAt" TIMESTAMP(3),
    "interviewAt" TIMESTAMP(3),
    "resultAt" TIMESTAMP(3),
    "projectStartedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateOpportunity_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "visitorId" TEXT,
ADD COLUMN "journeyStage" "JourneyStage" NOT NULL DEFAULT 'application_submitted',
ADD COLUMN "firstSource" TEXT,
ADD COLUMN "utmSource" TEXT,
ADD COLUMN "utmMedium" TEXT,
ADD COLUMN "utmCampaign" TEXT,
ADD COLUMN "utmContent" TEXT,
ADD COLUMN "utmTerm" TEXT,
ADD COLUMN "lastActivityAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "attendance" "IntroCallAttendance" NOT NULL DEFAULT 'scheduled';

-- Backfill journey stage from real booking/application status only.
UPDATE "Application"
SET "journeyStage" = 'intro_call_booked'
WHERE "status" = 'booked' OR "demoScheduledAt" IS NOT NULL;

UPDATE "Application"
SET "lastActivityAt" = "updatedAt"
WHERE "lastActivityAt" IS NULL;

UPDATE "Booking"
SET "attendance" = 'cancelled'
WHERE "status" = 'cancelled';

-- CreateIndex
CREATE INDEX "Visitor_userId_idx" ON "Visitor"("userId");
CREATE INDEX "Visitor_firstSeenAt_idx" ON "Visitor"("firstSeenAt");
CREATE INDEX "Visitor_firstSource_idx" ON "Visitor"("firstSource");
CREATE INDEX "Visitor_lastSeenAt_idx" ON "Visitor"("lastSeenAt");

CREATE INDEX "VisitorSession_visitorId_startedAt_idx" ON "VisitorSession"("visitorId", "startedAt");
CREATE INDEX "VisitorSession_lastSeenAt_idx" ON "VisitorSession"("lastSeenAt");

CREATE UNIQUE INDEX "CandidateEvent_idempotencyKey_key" ON "CandidateEvent"("idempotencyKey");
CREATE INDEX "CandidateEvent_applicationId_createdAt_idx" ON "CandidateEvent"("applicationId", "createdAt");
CREATE INDEX "CandidateEvent_visitorId_createdAt_idx" ON "CandidateEvent"("visitorId", "createdAt");
CREATE INDEX "CandidateEvent_eventType_createdAt_idx" ON "CandidateEvent"("eventType", "createdAt");
CREATE INDEX "CandidateEvent_userId_createdAt_idx" ON "CandidateEvent"("userId", "createdAt");
CREATE INDEX "CandidateEvent_createdAt_idx" ON "CandidateEvent"("createdAt");

CREATE INDEX "CandidateOpportunity_applicationId_updatedAt_idx" ON "CandidateOpportunity"("applicationId", "updatedAt");
CREATE INDEX "CandidateOpportunity_status_idx" ON "CandidateOpportunity"("status");
CREATE INDEX "CandidateOpportunity_platform_idx" ON "CandidateOpportunity"("platform");

CREATE INDEX "Application_visitorId_idx" ON "Application"("visitorId");
CREATE INDEX "Application_journeyStage_idx" ON "Application"("journeyStage");
CREATE INDEX "Application_firstSource_idx" ON "Application"("firstSource");
CREATE INDEX "Application_lastActivityAt_idx" ON "Application"("lastActivityAt");
CREATE INDEX "Booking_attendance_idx" ON "Booking"("attendance");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitorSession" ADD CONSTRAINT "VisitorSession_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateEvent" ADD CONSTRAINT "CandidateEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateOpportunity" ADD CONSTRAINT "CandidateOpportunity_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
