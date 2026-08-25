import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeEmail } from "@/server/auth/email";
import { verifyOtp } from "@/server/auth/otp";
import { hashOtp } from "@/server/auth/secrets";
import { db } from "@/server/db/prisma";

const hasPostgres = process.env.DATABASE_URL?.startsWith("postgres") ?? false;
const suite = describe.skipIf(!hasPostgres);
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = normalizeEmail(`otp-race-${stamp}@eafit.edu.co`);
const code = "314159";
let memberId = "";

suite("authentication challenge concurrency", () => {
  beforeAll(async () => {
    const member = await db.orm.public.Member.create({
      fullName: `OTP race ${stamp}`,
      institutionalEmail: email,
      memberType: "ACTIVE",
      status: "ACTIVE",
      roles: (roles) => roles.create({ role: "MEMBER" }),
    });
    memberId = member.id;

    await db.orm.public.AuthChallenge.create({
      email,
      kind: "OTP",
      codeHash: hashOtp(email, code),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ip: "127.0.0.1",
    });
  });

  afterAll(async () => {
    if (!memberId) return;
    await db.orm.public.AuthChallenge.where({ email }).deleteAndCount();
    await db.orm.public.IdentityAccount.where({ memberId }).deleteAndCount();
    await db.orm.public.MemberRole.where({ memberId }).deleteAndCount();
    await db.orm.public.Member.where({ id: memberId }).deleteAndCount();
  });

  it("allows an OTP challenge to be consumed only once under concurrency", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => verifyOtp({ email, code, ip: "127.0.0.1" }))
    );

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(7);
  });

  it("counts failed OTP attempts atomically under concurrency", async () => {
    const challenge = await db.orm.public.AuthChallenge.create({
      email,
      kind: "OTP",
      codeHash: hashOtp(email, "271828"),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ip: "127.0.0.1",
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        verifyOtp({ email, code: "000000", ip: "127.0.0.1" })
      )
    );
    expect(attempts.every((attempt) => attempt.status === "rejected")).toBe(true);

    const updated = await db.orm.public.AuthChallenge.first({ id: challenge.id });
    expect(updated?.attempts).toBe(updated?.maxAttempts);
  });
});
