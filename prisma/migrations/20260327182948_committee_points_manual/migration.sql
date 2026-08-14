-- CreateTable
CREATE TABLE "CommitteePointLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "basePoints" INTEGER NOT NULL,
    "committeeSize" INTEGER NOT NULL,
    "attendeeCount" INTEGER NOT NULL,
    "awardedPoints" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommitteePointLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteePointLog_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CommitteePointLog_eventId_committeeId_key" ON "CommitteePointLog"("eventId", "committeeId");
