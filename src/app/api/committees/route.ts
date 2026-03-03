import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const committees = await prisma.committee.findMany({
      include: {
        members: {
          include: {
            member: true,
          },
        },
      },
      orderBy: { points: "desc" },
    });
    return NextResponse.json(committees);
  } catch (error) {
    console.error("Error fetching committees:", error);
    return NextResponse.json(
      { error: "Error fetching committees" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color } = body;

    const committee = await prisma.committee.create({
      data: {
        name,
        color: color || "#1e3a5f",
      },
    });

    return NextResponse.json(committee);
  } catch (error) {
    console.error("Error creating committee:", error);
    return NextResponse.json(
      { error: "Error creating committee" },
      { status: 500 }
    );
  }
}
