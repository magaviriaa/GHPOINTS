-- CreateTable
CREATE TABLE "CommitteeEventScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "committeeId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeCount" INTEGER NOT NULL DEFAULT 0,
    "committeeSizeSnapshot" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommitteeEventScore_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitteeEventScore_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeEventScore_committeeId_eventId_key" ON "CommitteeEventScore"("committeeId", "eventId");
