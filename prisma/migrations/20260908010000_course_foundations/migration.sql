-- CreateTable
CREATE TABLE "CourseProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "courseSlug" TEXT NOT NULL,
    "currentModule" INTEGER NOT NULL DEFAULT 1,
    "completedModules" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startedModules" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "quizResults" JSONB,
    "lastLesson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CourseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "courseSlug" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "categoryScores" JSONB,
    "finalScore" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT,
    "email" TEXT,
    "usBased" BOOLEAN,
    "situation" TEXT,
    "state" TEXT,
    "shareScore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCertificate" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "courseSlug" TEXT NOT NULL,
    "learnerDisplayName" TEXT NOT NULL,
    "learnerLastInitial" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL,
    "shareScore" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'valid',

    CONSTRAINT "CourseCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseProgress_userId_courseSlug_idx" ON "CourseProgress"("userId", "courseSlug");

-- CreateIndex
CREATE INDEX "CourseProgress_visitorId_courseSlug_idx" ON "CourseProgress"("visitorId", "courseSlug");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_userId_courseSlug_submitted_idx" ON "AssessmentAttempt"("userId", "courseSlug", "submitted");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_visitorId_courseSlug_submitted_idx" ON "AssessmentAttempt"("visitorId", "courseSlug", "submitted");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_credentialId_key" ON "CourseCertificate"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_attemptId_key" ON "CourseCertificate"("attemptId");

-- CreateIndex
CREATE INDEX "CourseCertificate_credentialId_idx" ON "CourseCertificate"("credentialId");

-- AddForeignKey
ALTER TABLE "CourseProgress" ADD CONSTRAINT "CourseProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseProgress" ADD CONSTRAINT "CourseProgress_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
