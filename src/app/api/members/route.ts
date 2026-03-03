import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const members = await prisma.member.findMany({
      include: {
        committees: {
          include: {
            committee: true,
          },
        },
      },
      orderBy: { points: "desc" },
    });
    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Error fetching members" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, type, committeeIds } = body;

    const member = await prisma.member.create({
      data: {
        name,
        email,
        type: type || "activo",
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
    console.error("Error creating member:", error);
    return NextResponse.json(
      { error: "Error creating member" },
      { status: 500 }
    );
  }
}
