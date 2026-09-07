-- Additive: DEV and PROD share Postgres. Chat tables may already exist from the live API.
-- This migration creates missing chat objects and only adds feedback↔conversation columns.

DO $$ BEGIN
  CREATE TYPE "ChatStatus" AS ENUM ('open', 'waiting_for_team', 'waiting_for_user', 'resolved', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChatSenderType" AS ENUM ('visitor', 'candidate', 'team', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ChatMessageType" AS ENUM ('text', 'feedback');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ChatConversation" (
    "id" TEXT NOT NULL,
    "status" "ChatStatus" NOT NULL DEFAULT 'open',
    "topic" TEXT,
    "topicLabel" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "applicationId" TEXT,
    "assignedTo" TEXT,
    "startedFromPage" TEXT,
    "startedFromUrl" TEXT,
    "firstSource" TEXT,
    "firstUtmSource" TEXT,
    "firstUtmCampaign" TEXT,
    "currentFunnelStage" TEXT,
    "contextType" TEXT,
    "opportunityId" TEXT,
    "opportunityTitle" TEXT,
    "opportunityPlatform" TEXT,
    "contactEmail" TEXT,
    "displayName" TEXT NOT NULL DEFAULT 'Anonymous visitor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "senderLabel" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "messageType" "ChatMessageType" NOT NULL DEFAULT 'text',
    "feedbackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "feedbackId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;

CREATE INDEX IF NOT EXISTS "ChatConversation_visitorId_lastMessageAt_idx" ON "ChatConversation"("visitorId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_userId_lastMessageAt_idx" ON "ChatConversation"("userId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_applicationId_idx" ON "ChatConversation"("applicationId");
CREATE INDEX IF NOT EXISTS "ChatConversation_status_lastMessageAt_idx" ON "ChatConversation"("status", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_feedbackId_idx" ON "ChatMessage"("feedbackId");
CREATE INDEX IF NOT EXISTS "ChatMessage_senderType_readAt_idx" ON "ChatMessage"("senderType", "readAt");
CREATE INDEX IF NOT EXISTS "Feedback_conversationId_idx" ON "Feedback"("conversationId");

DO $$ BEGIN
  ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
