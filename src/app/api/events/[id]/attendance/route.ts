import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const { memberIds = [] } = await request.json();

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    let created = 0;

    for (const memberId of memberIds as string[]) {
      const existingAttendance = await prisma.eventAttendance.findUnique({
        where: {
          eventId_memberId: { eventId, memberId },
        },
      });

      if (existingAttendance) continue;

      await prisma.eventAttendance.create({
        data: {
          eventId,
          memberId,
          points: event.points,
        },
      });

      await prisma.member.update({
        where: { id: memberId },
        data: {
          points: { increment: event.points },
        },
      });

      created++;
    }

    return NextResponse.json({
      success: true,
      attendancesCreated: created,
      pointsPerMember: event.points,
    });
  } catch (error) {
    console.error("Error assigning points:", error);
    return NextResponse.json(
      { error: "Error assigning points" },
      { status: 500 }
    );
  }
}