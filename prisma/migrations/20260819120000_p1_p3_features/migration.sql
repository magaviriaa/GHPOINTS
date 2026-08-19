-- CreateEnum
CREATE TYPE "AuthChallengeKind" AS ENUM ('OTP', 'MAGIC_LINK');

-- AlterTable
ALTER TABLE "AuthChallenge" ADD COLUMN "kind" "AuthChallengeKind" NOT NULL DEFAULT 'OTP';

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "committeeId" TEXT,
ADD COLUMN "needsApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requireAttendanceToken" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attendanceTokenHash" TEXT;

-- AlterTable
ALTER TABLE "MemberBadge" ADD COLUMN "periodKey" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "MemberBadge_memberId_badgeId_seasonId_key";

-- CreateIndex
CREATE UNIQUE INDEX "MemberBadge_memberId_badgeId_seasonId_periodKey_key" ON "MemberBadge"("memberId", "badgeId", "seasonId", "periodKey");

-- CreateIndex
CREATE INDEX "AuthChallenge_email_kind_consumedAt_idx" ON "AuthChallenge"("email", "kind", "consumedAt");

-- CreateIndex
CREATE INDEX "Activity_needsApproval_status_idx" ON "Activity"("needsApproval", "status");

-- CreateIndex
CREATE INDEX "Activity_committeeId_idx" ON "Activity"("committeeId");

-- CreateTable
CREATE TABLE "ActivityPublicIdHistory" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityPublicIdHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityPublicIdHistory_activityId_idx" ON "ActivityPublicIdHistory"("activityId");

-- CreateIndex
CREATE INDEX "ActivityPublicIdHistory_publicId_idx" ON "ActivityPublicIdHistory"("publicId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPublicIdHistory" ADD CONSTRAINT "ActivityPublicIdHistory_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
