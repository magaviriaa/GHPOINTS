import { describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import { isUniqueConstraint } from "@/server/db/errors";

describe("idempotency guards", () => {
  it("detects unique violations", () => {
    expect(isUniqueConstraint({ sqlState: "23505" })).toBe(true);
    expect(isUniqueConstraint(new Error("nope"))).toBe(false);
  });

  it("maps duplicate attendance to a human message contract", () => {
    const error = new DomainError("ALREADY_REGISTERED", "Ya registraste tu asistencia.", 409);
    expect(error.message).toBe("Ya registraste tu asistencia.");
    expect(error.status).toBe(409);
  });
});
