import "dotenv/config";
import pg from "pg";

const SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "Season_one_active"
  ON "Season" ("status") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "MemberCommittee_one_active"
  ON "MemberCommittee" ("memberId", "committeeId")
  WHERE "isActive" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "PointTransaction_one_activity_award"
  ON "PointTransaction" ("attendanceId")
  WHERE "attendanceId" IS NOT NULL AND "type" = 'ACTIVITY';

CREATE UNIQUE INDEX IF NOT EXISTS "MemberRole_global_unique"
  ON "MemberRole" ("memberId", "role")
  WHERE "committeeId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MemberRole_committee_unique"
  ON "MemberRole" ("memberId", "role", "committeeId")
  WHERE "committeeId" IS NOT NULL;
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(SQL);
  await client.end();
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
