-- AlterEnum
ALTER TYPE "FeedbackStatus" ADD VALUE 'spam';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN "visitorId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "Feedback" ADD COLUMN "applicationId" TEXT;

-- CreateIndex
CREATE INDEX "Feedback_visitorId_idx" ON "Feedback"("visitorId");
CREATE INDEX "Feedback_applicationId_idx" ON "Feedback"("applicationId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
