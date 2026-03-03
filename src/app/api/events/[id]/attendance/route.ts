import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Assign GH Points to members for an event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const body = await request.json();
    const { memberIds } = body;

    // Get the event to know how many points to assign
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const results = [];

    for (const memberId of memberIds) {
      // Check if attendance already exists
      const existingAttendance = await prisma.eventAttendance.findUnique({
        where: {
          eventId_memberId: {
            eventId,
            memberId,
          },
        },
      });

      if (existingAttendance) {
        continue; // Skip if already attended
      }

      // Create attendance record
      const attendance = await prisma.eventAttendance.create({
        data: {
          eventId,
          memberId,
          points: event.points,
        },
      });

      // Update member's individual points
      await prisma.member.update({
        where: { id: memberId },
        data: {
          points: { increment: event.points },
        },
      });

      // Get member's committees and update their points
      const memberCommittees = await prisma.memberCommittee.findMany({
        where: { memberId },
      });

      for (const mc of memberCommittees) {
        await prisma.committee.update({
          where: { id: mc.committeeId },
          data: {
            points: { increment: event.points },
          },
        });
      }

      results.push(attendance);
    }

    return NextResponse.json({
      success: true,
      attendancesCreated: results.length,
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

// Remove attendance
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const body = await request.json();
    const { memberId } = body;

    // Get attendance to know points
    const attendance = await prisma.eventAttendance.findUnique({
      where: {
        eventId_memberId: {
          eventId,
          memberId,
        },
      },
    });

    if (!attendance) {
      return NextResponse.json(
        { error: "Attendance not found" },
        { status: 404 }
      );
    }

    // Delete attendance
    await prisma.eventAttendance.delete({
      where: { id: attendance.id },
    });

    // Subtract points from member
    await prisma.member.update({
      where: { id: memberId },
      data: {
        points: { decrement: attendance.points },
      },
    });

    // Subtract points from member's committees
    const memberCommittees = await prisma.memberCommittee.findMany({
      where: { memberId },
    });

    for (const mc of memberCommittees) {
      await prisma.committee.update({
        where: { id: mc.committeeId },
        data: {
          points: { decrement: attendance.points },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing attendance:", error);
    return NextResponse.json(
      { error: "Error removing attendance" },
      { status: 500 }
    );
  }
}
