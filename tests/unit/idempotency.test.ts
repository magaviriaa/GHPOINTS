import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import { isUniqueConstraint } from "@/server/db/errors";

describe("idempotency guards", () => {
  it("detects Prisma unique violations", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(isUniqueConstraint(error)).toBe(true);
    expect(isUniqueConstraint(new Error("nope"))).toBe(false);
  });

  it("maps duplicate attendance to a human message contract", () => {
    const error = new DomainError("ALREADY_REGISTERED", "Ya registraste tu asistencia.", 409);
    expect(error.message).toBe("Ya registraste tu asistencia.");
    expect(error.status).toBe(409);
  });
});
