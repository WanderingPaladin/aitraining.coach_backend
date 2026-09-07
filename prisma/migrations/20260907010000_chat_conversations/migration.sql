-- CreateEnum
CREATE TYPE "ChatConversationStatus" AS ENUM ('open', 'waiting_for_team', 'waiting_for_user', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('visitor', 'candidate', 'team', 'system');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('text', 'image', 'file', 'system');

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "applicationId" TEXT,
    "topic" TEXT,
    "status" "ChatConversationStatus" NOT NULL DEFAULT 'open',
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "senderUserId" TEXT,
    "body" TEXT NOT NULL,
    "messageType" "ChatMessageType" NOT NULL DEFAULT 'text',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatConversation_visitorId_status_idx" ON "ChatConversation"("visitorId", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_userId_status_idx" ON "ChatConversation"("userId", "status");

-- CreateIndex
CREATE INDEX "ChatConversation_applicationId_idx" ON "ChatConversation"("applicationId");

-- CreateIndex
CREATE INDEX "ChatConversation_status_lastMessageAt_idx" ON "ChatConversation"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_readAt_idx" ON "ChatMessage"("conversationId", "readAt");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
