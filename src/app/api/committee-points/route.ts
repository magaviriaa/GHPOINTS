import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const {
      eventId,
      committeeId,
      basePoints,
      committeeSize,
      attendeeCount,
    } = await request.json();

    if (!eventId || !committeeId) {
      return NextResponse.json(
        { error: "eventId y committeeId son obligatorios" },
        { status: 400 }
      );
    }

    const numericBasePoints = Number(basePoints);
    const numericCommitteeSize = Number(committeeSize);
    const numericAttendeeCount = Number(attendeeCount);

    if (
      Number.isNaN(numericBasePoints) ||
      Number.isNaN(numericCommitteeSize) ||
      Number.isNaN(numericAttendeeCount)
    ) {
      return NextResponse.json(
        { error: "Los valores numéricos no son válidos" },
        { status: 400 }
      );
    }

    const awardedPoints =
      numericCommitteeSize > 0 && numericAttendeeCount >= 2
        ? Math.round((numericBasePoints * numericAttendeeCount) / numericCommitteeSize)
        : 0;

    await prisma.committeePointLog.upsert({
      where: {
        eventId_committeeId: {
          eventId,
          committeeId,
        },
      },
      update: {
        basePoints: numericBasePoints,
        committeeSize: numericCommitteeSize,
        attendeeCount: numericAttendeeCount,
        awardedPoints,
      },
      create: {
        eventId,
        committeeId,
        basePoints: numericBasePoints,
        committeeSize: numericCommitteeSize,
        attendeeCount: numericAttendeeCount,
        awardedPoints,
      },
    });

    const total = await prisma.committeePointLog.aggregate({
      where: { committeeId },
      _sum: { awardedPoints: true },
    });

    await prisma.committee.update({
      where: { id: committeeId },
      data: {
        points: total._sum.awardedPoints ?? 0,
      },
    });

    return NextResponse.json({
      success: true,
      awardedPoints,
    });
  } catch (error) {
    console.error("Error assigning committee points:", error);
    return NextResponse.json(
      { error: "Error assigning committee points" },
      { status: 500 }
    );
  }
}