-- CreateEnum
CREATE TYPE "ApplicantStage" AS ENUM ('new_no_account', 'has_accounts_no_time', 'working_no_progress');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "applicantStage" "ApplicantStage";
