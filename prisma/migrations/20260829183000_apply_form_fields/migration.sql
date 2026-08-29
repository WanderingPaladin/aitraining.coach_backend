-- AlterTable
ALTER TABLE "Application" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Application" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Application" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Application" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Application" ADD COLUMN "yearsOfExperience" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Application" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "Application" ADD COLUMN "ipLocation" TEXT;

UPDATE "Application"
SET
  "firstName" = split_part("fullName", ' ', 1),
  "lastName" = COALESCE(NULLIF(btrim(substring("fullName" from position(' ' in "fullName"))), ''), '');

UPDATE "Application" SET "phone" = '' WHERE "phone" IS NULL;
UPDATE "Application" SET "profession" = '' WHERE "profession" IS NULL;

ALTER TABLE "Application" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "Application" ALTER COLUMN "profession" SET NOT NULL;

ALTER TABLE "Application" ALTER COLUMN "path" SET DEFAULT 'new_professional';
ALTER TABLE "Application" ALTER COLUMN "background" SET DEFAULT '';
ALTER TABLE "Application" ALTER COLUMN "goals" SET DEFAULT '';
