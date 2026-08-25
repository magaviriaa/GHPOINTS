import "dotenv/config";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { getIndividualRanking, getMemberBoardPosition } from "@/server/domain/ranking";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("getMemberBoardPosition (db)", () => {

  it("agrees with the full board for every entry, ties included", async () => {
    for (const board of ["ACTIVE", "NEW"] as const) {
      for (const period of ["season", "month"] as const) {
        const full = await getIndividualRanking({ board, period });
        if (full.entries.length === 0) continue;

        for (const entry of full.entries) {
          const position = await getMemberBoardPosition({
            memberId: entry.memberId,
            board,
            period,
          });
          expect(position).not.toBeNull();
          expect(position?.total).toBe(entry.total);
          expect(position?.rank).toBe(entry.rank);
          expect(position?.boardSize).toBe(full.entries.length);
        }
      }
    }
  });

  it("leaves an Integrante with no transactions off the board", async () => {
    const orphan = await db.orm.public.Member.where({ status: "ACTIVE" })
      .where((member) => member.pointTransactions.none())
      .select("id", "memberType")
      .first();
    if (!orphan) return;

    const position = await getMemberBoardPosition({
      memberId: orphan.id,
      board: orphan.memberType,
      period: "season",
    });
    expect(position?.rank).toBeNull();
    expect(position?.total).toBe(0);
  });

  it("spans both boards when no board is given", async () => {
    const [active, newer] = await Promise.all([
      getIndividualRanking({ board: "ACTIVE", period: "season" }),
      getIndividualRanking({ board: "NEW", period: "season" }),
    ]);
    const combined = [...active.entries, ...newer.entries];
    if (combined.length === 0) return;

    const best = combined.reduce((left, right) => (right.total > left.total ? right : left));
    const position = await getMemberBoardPosition({
      memberId: best.memberId,
      period: "season",
    });
    expect(position?.rank).toBe(1);
    expect(position?.boardSize).toBe(combined.length);
  });
});
