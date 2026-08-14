import { prisma } from "@/lib/db";
import { recalculateCommitteePointsForEvent } from "@/lib/committee-points";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        committees: {
          include: {
            committee: true,
          },
        },
        attendances: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    return NextResponse.json(member);
  } catch (error) {
    console.error("Error fetching member:", error);
    return NextResponse.json(
      { error: "Error fetching member" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, type, committeeIds } = body;

    // Delete existing committee relationships
    await prisma.memberCommittee.deleteMany({
      where: { memberId: id },
    });

    const member = await prisma.member.update({
      where: { id },
      data: {
        name,
        email,
        type,
        committees: {
          create: committeeIds?.map((committeeId: string) => ({
            committeeId,
          })) || [],
        },
      },
      include: {
        committees: {
          include: {
            committee: true,
          },
        },
      },
    });

    return NextResponse.json(member);
  } catch (error) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: "Error updating member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const member = await prisma.member.findUnique({
      where: { id },
      include: {
        committees: {
          select: { committeeId: true },
        },
        attendances: {
          select: { eventId: true },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const affectedCommitteeIds = member.committees.map((c) => c.committeeId);
    const affectedEventIds = Array.from(
      new Set(member.attendances.map((a) => a.eventId))
    );

    await prisma.member.delete({
      where: { id },
    });

    for (const eventId of affectedEventIds) {
      await recalculateCommitteePointsForEvent(eventId, affectedCommitteeIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting member:", error);
    return NextResponse.json(
      { error: "Error deleting member" },
      { status: 500 }
    );
  }
}