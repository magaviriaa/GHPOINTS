import { prisma } from "@/lib/db";

const MIN_COMMITTEE_ATTENDEES = 2;

export async function recalculateCommitteePointsForEvent(
  eventId: string,
  affectedCommitteeIds?: string[]
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { committeeScores: true },
  });

  if (!event) {
    throw new Error("Event not found");
  }

  const committeeIds =
    affectedCommitteeIds && affectedCommitteeIds.length > 0
      ? Array.from(new Set(affectedCommitteeIds))
      : event.committeeScores.map((score) => score.committeeId);

  for (const committeeId of committeeIds) {
    const existingScore = await prisma.committeeEventScore.findUnique({
      where: {
        committeeId_eventId: { committeeId, eventId },
      },
    });

    const committeeSizeSnapshot =
      existingScore?.committeeSizeSnapshot ??
      (await prisma.memberCommittee.count({
        where: { committeeId },
      }));

    const attendeeCount = await prisma.eventAttendance.count({
      where: {
        eventId,
        member: {
          committees: {
            some: { committeeId },
          },
        },
      },
    });

    const points =
      committeeSizeSnapshot > 0 && attendeeCount >= MIN_COMMITTEE_ATTENDEES
        ? Math.round((event.points * attendeeCount) / committeeSizeSnapshot)
        : 0;

    await prisma.committeeEventScore.upsert({
      where: {
        committeeId_eventId: { committeeId, eventId },
      },
      update: {
        attendeeCount,
        points,
      },
      create: {
        committeeId,
        eventId,
        attendeeCount,
        committeeSizeSnapshot,
        points,
      },
    });

    const total = await prisma.committeeEventScore.aggregate({
      where: { committeeId },
      _sum: { points: true },
    });

    await prisma.committee.update({
      where: { id: committeeId },
      data: {
        points: total._sum.points ?? 0,
      },
    });
  }
}

export async function recalculateCommitteeTotals(committeeIds: string[]) {
  const uniqueCommitteeIds = Array.from(new Set(committeeIds));

  for (const committeeId of uniqueCommitteeIds) {
    const total = await prisma.committeeEventScore.aggregate({
      where: { committeeId },
      _sum: { points: true },
    });

    await prisma.committee.update({
      where: { id: committeeId },
      data: {
        points: total._sum.points ?? 0,
      },
    });
  }
}