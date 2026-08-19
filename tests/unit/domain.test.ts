import { describe, expect, it } from "vitest";
import {
  creditForMember,
  membershipActiveAt,
  participationRate,
  averageRate,
  snapshotEligibleCount,
} from "@/server/domain/scoring-pure";
import { competitionRanks, withCompetitionRanks } from "@/server/domain/ranking-pure";
import { levelForPoints } from "@/server/domain/levels-pure";
import {
  consecutiveActivityStreak,
  earnsPointsBadge,
  earnsStreakBadge,
  earnsTopBadge,
  monthlyMvpMemberIds,
} from "@/server/domain/badges-pure";
import { isEntraTidAllowed, entraEmailFromClaims } from "@/server/auth/entra-pure";
import { parseIsoWeekId, rangeForIsoWeek } from "@/lib/dates";
import { assertAttendanceTransition } from "@/server/domain/attendance-credit";
import { DomainError, ErrorCodes, isDomainError } from "@/server/domain/errors";
import { isAllowedEmailDomain, normalizeEmail } from "@/server/auth/email";
import { parseEnum } from "@/server/actions/form-parse";
import {
  canViewCommitteeRoster,
  ledCommitteeIds,
  requireCommitteeViewer,
  type Actor,
} from "@/server/domain/authorization";
import { parseTabular } from "@/server/domain/import";

describe("CommitteeScoringService (pure)", () => {
  it("FULL_CREDIT counts 1 per committee even if the member is in several", () => {
    expect(creditForMember("FULL_CREDIT", 3)).toBe(1);
  });

  it("FRACTIONAL_CREDIT splits participation evenly", () => {
    expect(creditForMember("FRACTIONAL_CREDIT", 2)).toBeCloseTo(0.5);
    expect(creditForMember("FRACTIONAL_CREDIT", 3)).toBeCloseTo(1 / 3);
  });

  it("uses relative participation, not raw headcount", () => {
    const gemis = participationRate(12, 30);
    const cas = participationRate(6, 10);
    expect(cas).toBeGreaterThan(gemis);
    expect(round1(cas)).toBe(60);
    expect(round1(gemis)).toBe(40);
  });

  it("returns 0 when a committee has no eligible members", () => {
    expect(participationRate(4, 0)).toBe(0);
  });

  it("averages activity rates for the season score", () => {
    expect(averageRate([0.4, 0.6])).toBeCloseTo(0.5);
    expect(averageRate([])).toBe(0);
  });

  it("honors historical membership at attendance time", () => {
    const joined = new Date("2026-01-01T00:00:00Z");
    const left = new Date("2026-03-01T00:00:00Z");
    const during = new Date("2026-02-01T00:00:00Z");
    const after = new Date("2026-04-01T00:00:00Z");
    expect(membershipActiveAt(joined, left, during)).toBe(true);
    expect(membershipActiveAt(joined, left, after)).toBe(false);
    expect(membershipActiveAt(joined, null, after)).toBe(true);
  });

  it("freezes the eligible count only when the snapshot is already frozen", () => {
    expect(snapshotEligibleCount(10, null, false)).toBe(10);
    expect(snapshotEligibleCount(10, { frozen: false, eligibleMemberCount: 7 }, true)).toBe(10);
    expect(snapshotEligibleCount(10, { frozen: true, eligibleMemberCount: 7 }, true)).toBe(7);
    expect(snapshotEligibleCount(10, { frozen: true, eligibleMemberCount: 7 }, false)).toBe(10);
  });
});

describe("RankingService (pure)", () => {
  it("uses competition ranking for ties: 1, 2, 2, 4", () => {
    expect(competitionRanks([100, 90, 90, 80])).toEqual([1, 2, 2, 4]);
  });

  it("keeps equal scores on the same rank and honors the tie-break comparator", () => {
    const ranked = withCompetitionRanks(
      [
        { total: 20, name: "Ana" },
        { total: 40, name: "Cata" },
        { total: 40, name: "Beto" },
      ],
      (left, right) => left.name.localeCompare(right.name, "es")
    );
    expect(ranked.map((row) => row.name)).toEqual(["Beto", "Cata", "Ana"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(1);
    expect(ranked[2]?.rank).toBe(3);
  });
});

describe("Asistencia credit transitions", () => {
  it("allows PENDING to APPROVED, REJECTED, and CANCELLED", () => {
    expect(() => assertAttendanceTransition("PENDING", "APPROVED")).not.toThrow();
    expect(() => assertAttendanceTransition("PENDING", "REJECTED")).not.toThrow();
    expect(() => assertAttendanceTransition("PENDING", "CANCELLED")).not.toThrow();
  });

  it("allows APPROVED to REJECTED or CANCELLED, and treats same-status as idempotent", () => {
    expect(() => assertAttendanceTransition("APPROVED", "REJECTED")).not.toThrow();
    expect(() => assertAttendanceTransition("APPROVED", "CANCELLED")).not.toThrow();
    expect(() => assertAttendanceTransition("APPROVED", "APPROVED")).not.toThrow();
    expect(() => assertAttendanceTransition("REJECTED", "REJECTED")).not.toThrow();
  });

  it("rejects re-approval after REJECTED or CANCELLED", () => {
    expect(() => assertAttendanceTransition("REJECTED", "APPROVED")).toThrow(DomainError);
    expect(() => assertAttendanceTransition("CANCELLED", "APPROVED")).toThrow(DomainError);
    try {
      assertAttendanceTransition("REJECTED", "APPROVED");
      throw new Error("expected conflict");
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (isDomainError(error)) {
        expect(error.code).toBe(ErrorCodes.CONFLICT);
      }
    }
  });
});

describe("email whitelist", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  Ana@Universidad.EDU.CO ")).toBe("ana@universidad.edu.co");
  });

  it("rejects non-institutional domains", () => {
    expect(isAllowedEmailDomain("ana@gmail.com", ["eafit.edu.co"])).toBe(false);
    expect(isAllowedEmailDomain("ana@eafit.edu.co", ["eafit.edu.co"])).toBe(true);
  });
});

describe("admin FormData enum parse", () => {
  it("accepts a listed value and rejects unknown ones", () => {
    expect(parseEnum("NEW", ["NEW", "ACTIVE"])).toBe("NEW");
    expect(() => parseEnum(" intern ", ["NEW", "ACTIVE"])).toThrow(DomainError);
  });
});

function leaderActor(roles: Actor["roles"]): Actor {
  return {
    id: "actor-1",
    fullName: "Lina Líder",
    institutionalEmail: "lina@example.test",
    memberType: "ACTIVE",
    status: "ACTIVE",
    sessionId: "session-1",
    roles,
  };
}

describe("COMMITTEE_LEADER authorization", () => {
  it("lists only committees attached to the COMMITTEE_LEADER role", () => {
    const actor = leaderActor([
      { role: "MEMBER", committeeId: null },
      { role: "COMMITTEE_LEADER", committeeId: "gemis" },
    ]);
    expect(ledCommitteeIds(actor)).toEqual(["gemis"]);
    expect(canViewCommitteeRoster(actor, "gemis")).toBe(true);
    expect(canViewCommitteeRoster(actor, "pixel")).toBe(false);
  });

  it("lets ADMIN view any committee roster and forbids a foreign leader", () => {
    const admin = leaderActor([{ role: "ADMIN", committeeId: null }]);
    const leader = leaderActor([{ role: "COMMITTEE_LEADER", committeeId: "gemis" }]);
    expect(canViewCommitteeRoster(admin, "pixel")).toBe(true);
    expect(() => requireCommitteeViewer(leader, "pixel")).toThrow(DomainError);
  });
});

function csvBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("import spreadsheet schema", () => {
  it("maps member columns on the happy path", () => {
    const rows = parseTabular(
      csvBuffer("Nombre,Correo,Tipo,Comités\nAna Pérez,ana@eafit.edu.co,NEW,gemis"),
      "integrantes.csv",
      "MEMBERS"
    );
    expect(rows).toEqual([
      {
        fullName: "Ana Pérez",
        email: "ana@eafit.edu.co",
        memberTypeLabel: "NEW",
        committeeLabel: "gemis",
      },
    ]);
  });

  it("rejects unknown headers and missing required columns", () => {
    expect(() =>
      parseTabular(csvBuffer("Nombre,Correo,Extra\nAna,ana@eafit.edu.co,x"), "bad.csv", "MEMBERS")
    ).toThrow(DomainError);
    try {
      parseTabular(csvBuffer("Nombre\nAna"), "missing.csv", "MEMBERS");
      throw new Error("expected validation");
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (isDomainError(error)) {
        expect(error.code).toBe(ErrorCodes.VALIDATION);
      }
    }
  });
});

function round1(rate: number) {
  return Number((rate * 100).toFixed(1));
}

describe("levels from GH Points", () => {
  it("maps thresholds 0 / 100 / 250 / 500 / 1000", () => {
    expect(levelForPoints(0).current.slug).toBe("novato");
    expect(levelForPoints(99).current.slug).toBe("novato");
    expect(levelForPoints(100).current.slug).toBe("bronce");
    expect(levelForPoints(250).current.slug).toBe("plata");
    expect(levelForPoints(500).current.slug).toBe("oro");
    expect(levelForPoints(1000).current.slug).toBe("elite");
    expect(levelForPoints(1000).next).toBeNull();
  });
});

describe("badge rules (pure)", () => {
  it("counts consecutive attended activities from the newest", () => {
    const streak = consecutiveActivityStreak(
      [{ id: "c" }, { id: "b" }, { id: "a" }],
      new Set(["c", "b"])
    );
    expect(streak).toBe(2);
    expect(earnsStreakBadge(2)).toBe(false);
    expect(earnsStreakBadge(3)).toBe(true);
  });

  it("awards points, top 10 and monthly MVP from ledger-derived totals", () => {
    expect(earnsPointsBadge(499)).toBe(false);
    expect(earnsPointsBadge(500)).toBe(true);
    expect(earnsTopBadge(10)).toBe(true);
    expect(earnsTopBadge(11)).toBe(false);
    expect(monthlyMvpMemberIds([{ memberId: "a", total: 10 }, { memberId: "b", total: 10 }])).toEqual([
      "a",
      "b",
    ]);
    expect(monthlyMvpMemberIds([{ memberId: "a", total: 0 }])).toEqual([]);
  });
});

describe("Entra tenant allowlist", () => {
  it("requires allowlist for multi-tenant ids and matches oid email claims", () => {
    expect(isEntraTidAllowed("aaa", "organizations", [])).toBe(false);
    expect(isEntraTidAllowed("aaa", "organizations", ["aaa"])).toBe(true);
    expect(isEntraTidAllowed("Tenant-A", "tenant-a", [])).toBe(true);
    expect(entraEmailFromClaims({ preferred_username: "ana@eafit.edu.co" })).toBe(
      "ana@eafit.edu.co"
    );
  });
});

describe("ISO week windows", () => {
  it("parses an ISO week id and returns a 7-day UTC range", () => {
    expect(parseIsoWeekId("2026-W33")).toEqual({ year: 2026, week: 33 });
    const range = rangeForIsoWeek("2026-W33");
    expect(range).not.toBeNull();
    if (!range) return;
    expect(range.end.getTime() - range.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
