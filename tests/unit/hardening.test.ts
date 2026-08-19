import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/redirect";
import { escapeHtml } from "@/lib/text";
import { escapeSpreadsheetCell } from "@/server/domain/export";
import { parseActivityFields } from "@/server/domain/activities";
import { computeCommitteeSnapshots } from "@/server/domain/scoring-pure";
import { competitionRanks, rankingWindow } from "@/server/domain/ranking-pure";
import { rangeForIsoWeek, startOfMonthUtc, startOfWeekUtc } from "@/lib/dates";
import { ErrorCodes, isDomainError } from "@/server/domain/errors";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths, including query strings", () => {
    expect(safeRedirectPath("/app/rankings")).toBe("/app/rankings");
    expect(safeRedirectPath("/a/abc123?t=tok")).toBe("/a/abc123?t=tok");
  });

  it("rejects the protocol-relative and backslash forms browsers treat as external", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/app");
    expect(safeRedirectPath("/\\evil.com")).toBe("/app");
    expect(safeRedirectPath("https://evil.com")).toBe("/app");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/app");
    expect(safeRedirectPath(undefined)).toBe("/app");
  });
});

describe("export escaping", () => {
  it("neutralises cells a spreadsheet would evaluate", () => {
    expect(escapeSpreadsheetCell("=1+1")).toBe("'=1+1");
    expect(escapeSpreadsheetCell("+34 300")).toBe("'+34 300");
    expect(escapeSpreadsheetCell("@GEMIS")).toBe("'@GEMIS");
    expect(escapeSpreadsheetCell("-10")).toBe("'-10");
  });

  it("leaves ordinary values alone", () => {
    expect(escapeSpreadsheetCell("Mateo Lopera")).toBe("Mateo Lopera");
    expect(escapeSpreadsheetCell(540)).toBe(540);
    expect(escapeSpreadsheetCell(null)).toBe(null);
  });
});

describe("escapeHtml", () => {
  it("escapes markup coming from member and activity names", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });
});

describe("parseActivityFields", () => {
  const base = {
    name: "Athletic Masculino vs Clubmerc",
    individualPoints: 20,
    startsAt: new Date("2026-08-13T23:00:00.000Z"),
    registrationStart: new Date("2026-08-13T22:30:00.000Z"),
    registrationEnd: new Date("2026-08-14T01:30:00.000Z"),
  };

  it("accepts a well formed activity", () => {
    expect(parseActivityFields(base).individualPoints).toBe(20);
  });

  it("rejects NaN points coming from an empty form field", () => {
    expect(() => parseActivityFields({ ...base, individualPoints: Number("abc") })).toThrow();
  });

  it("rejects negative and fractional points", () => {
    expect(() => parseActivityFields({ ...base, individualPoints: -5 })).toThrow();
    expect(() => parseActivityFields({ ...base, individualPoints: 2.5 })).toThrow();
  });

  it("rejects an empty name with a VALIDATION domain error", () => {
    try {
      parseActivityFields({ ...base, name: "   " });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      expect(isDomainError(error) && error.code).toBe(ErrorCodes.VALIDATION);
    }
  });

  it("rejects an inverted registration window", () => {
    expect(() =>
      parseActivityFields({
        ...base,
        registrationStart: base.registrationEnd,
        registrationEnd: base.registrationStart,
      })
    ).toThrow();
  });

  it("rejects an invalid date", () => {
    expect(() => parseActivityFields({ ...base, startsAt: new Date("nope") })).toThrow();
  });
});

describe("computeCommitteeSnapshots", () => {
  const joined = new Date("2026-01-01T00:00:00.000Z");
  const registeredAt = new Date("2026-08-13T23:10:00.000Z");

  it("FULL_CREDIT gives a multi-committee attendee full credit in each", () => {
    const snapshots = computeCommitteeSnapshots({
      committees: [
        { id: "gemis", liveEligibleCount: 30 },
        { id: "pixel", liveEligibleCount: 10 },
      ],
      attendances: [{ memberId: "m1", registeredAt }],
      memberships: [
        { memberId: "m1", committeeId: "gemis", joinedAt: joined, leftAt: null },
        { memberId: "m1", committeeId: "pixel", joinedAt: joined, leftAt: null },
      ],
      existingByCommittee: new Map(),
      strategy: "FULL_CREDIT",
      shouldFreeze: false,
    });
    expect(snapshots.map((row) => row.attendeeCredit)).toEqual([1, 1]);
    expect(snapshots[0]!.participationRate).toBeCloseTo(1 / 30);
  });

  it("FRACTIONAL_CREDIT splits the same attendee across their committees", () => {
    const snapshots = computeCommitteeSnapshots({
      committees: [
        { id: "gemis", liveEligibleCount: 30 },
        { id: "pixel", liveEligibleCount: 10 },
      ],
      attendances: [{ memberId: "m1", registeredAt }],
      memberships: [
        { memberId: "m1", committeeId: "gemis", joinedAt: joined, leftAt: null },
        { memberId: "m1", committeeId: "pixel", joinedAt: joined, leftAt: null },
      ],
      existingByCommittee: new Map(),
      strategy: "FRACTIONAL_CREDIT",
      shouldFreeze: false,
    });
    expect(snapshots.map((row) => row.attendeeCredit)).toEqual([0.5, 0.5]);
  });

  it("ignores a membership that had already ended at Asistencia time (ADR-007)", () => {
    const snapshots = computeCommitteeSnapshots({
      committees: [{ id: "gemis", liveEligibleCount: 30 }],
      attendances: [{ memberId: "m1", registeredAt }],
      memberships: [
        {
          memberId: "m1",
          committeeId: "gemis",
          joinedAt: joined,
          leftAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      existingByCommittee: new Map(),
      strategy: "FULL_CREDIT",
      shouldFreeze: false,
    });
    expect(snapshots[0]!.attendeeCredit).toBe(0);
    expect(snapshots[0]!.participationRate).toBe(0);
  });

  it("keeps the frozen denominator once the Actividad is closed", () => {
    const snapshots = computeCommitteeSnapshots({
      committees: [{ id: "gemis", liveEligibleCount: 41 }],
      attendances: [{ memberId: "m1", registeredAt }],
      memberships: [
        { memberId: "m1", committeeId: "gemis", joinedAt: joined, leftAt: null },
      ],
      existingByCommittee: new Map([
        ["gemis", { frozen: true, eligibleMemberCount: 30 }],
      ]),
      strategy: "FULL_CREDIT",
      shouldFreeze: true,
    });
    expect(snapshots[0]!.eligibleMemberCount).toBe(30);
  });

  it("a smaller committee with relatively more attendance outranks a bigger one", () => {
    const snapshots = computeCommitteeSnapshots({
      committees: [
        { id: "gemis", liveEligibleCount: 30 },
        { id: "cas", liveEligibleCount: 10 },
      ],
      attendances: Array.from({ length: 12 }, (_, index) => ({
        memberId: `g${index}`,
        registeredAt,
      })).concat(
        Array.from({ length: 6 }, (_, index) => ({ memberId: `c${index}`, registeredAt }))
      ),
      memberships: [
        ...Array.from({ length: 12 }, (_, index) => ({
          memberId: `g${index}`,
          committeeId: "gemis",
          joinedAt: joined,
          leftAt: null,
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          memberId: `c${index}`,
          committeeId: "cas",
          joinedAt: joined,
          leftAt: null,
        })),
      ],
      existingByCommittee: new Map(),
      strategy: "FULL_CREDIT",
      shouldFreeze: false,
    });
    const [gemis, cas] = snapshots;
    expect(gemis!.participationRate).toBeCloseTo(0.4);
    expect(cas!.participationRate).toBeCloseTo(0.6);
    expect(cas!.participationRate).toBeGreaterThan(gemis!.participationRate);
  });
});

describe("rankingWindow", () => {
  const now = new Date("2026-08-19T17:00:00.000Z");

  it("season has no window", () => {
    expect(rankingWindow("season", { now })).toBeNull();
  });

  it("month starts at the first of the month in APP_TIMEZONE", () => {
    const window = rankingWindow("month", { now });
    expect(window?.gte.getTime()).toBe(startOfMonthUtc(now).getTime());
    expect(window?.lt).toBeNull();
  });

  it("week without isoWeek starts at the current week", () => {
    const window = rankingWindow("week", { now });
    expect(window?.gte.getTime()).toBe(startOfWeekUtc(now).getTime());
    expect(window?.lt).toBeNull();
  });

  it("week with isoWeek is the closed 7-day range", () => {
    const window = rankingWindow("week", { now, isoWeek: "2026-W34" });
    const range = rangeForIsoWeek("2026-W34");
    expect(window?.gte.getTime()).toBe(range?.start.getTime());
    expect(window?.lt?.getTime()).toBe(range?.end.getTime());
  });

  it("falls back to the current week when the isoWeek is garbage", () => {
    const window = rankingWindow("week", { now, isoWeek: "nope" });
    expect(window?.gte.getTime()).toBe(startOfWeekUtc(now).getTime());
  });
});

describe("competition rank identity", () => {
  // getMemberBoardPosition computes rank as 1 + count(totals strictly greater).
  // That has to agree with the board-wide competitionRanks for every entry.
  const boards = [
    [100, 90, 90, 80, 10],
    [50, 50, 50],
    [7],
    [0, 0, 5],
  ];

  it("1 + count(greater) equals the board rank, ties included", () => {
    for (const totals of boards) {
      const sorted = [...totals].sort((left, right) => right - left);
      const ranks = competitionRanks(sorted);
      sorted.forEach((total, index) => {
        const above = sorted.filter((other) => other > total).length;
        expect(above + 1).toBe(ranks[index]);
      });
    }
  });

  it("reproduces the 1, 2, 2, 4 shape of ADR-008", () => {
    expect(competitionRanks([100, 90, 90, 80])).toEqual([1, 2, 2, 4]);
  });
});
