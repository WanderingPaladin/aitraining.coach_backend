-- AlterEnum
ALTER TYPE "ChatMessageType" ADD VALUE 'feedback';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN "conversationId" TEXT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "feedbackId" TEXT;

-- CreateIndex
CREATE INDEX "Feedback_conversationId_idx" ON "Feedback"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_feedbackId_idx" ON "ChatMessage"("feedbackId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;
