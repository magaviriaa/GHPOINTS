import { Prisma } from "@prisma/client";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Prisma catch-boundary
export function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
