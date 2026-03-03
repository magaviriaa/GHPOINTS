import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const committee = await prisma.committee.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            member: true,
          },
        },
      },
    });

    if (!committee) {
      return NextResponse.json(
        { error: "Committee not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(committee);
  } catch (error) {
    console.error("Error fetching committee:", error);
    return NextResponse.json(
      { error: "Error fetching committee" },
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
    const { name, color } = body;

    const committee = await prisma.committee.update({
      where: { id },
      data: { name, color },
    });

    return NextResponse.json(committee);
  } catch (error) {
    console.error("Error updating committee:", error);
    return NextResponse.json(
      { error: "Error updating committee" },
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
    await prisma.committee.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting committee:", error);
    return NextResponse.json(
      { error: "Error deleting committee" },
      { status: 500 }
    );
  }
}
