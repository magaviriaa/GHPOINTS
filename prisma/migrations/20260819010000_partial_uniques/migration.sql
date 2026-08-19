-- One ACTIVE season at a time
CREATE UNIQUE INDEX "Season_one_active" ON "Season" ("status") WHERE "status" = 'ACTIVE';

-- One active membership per member/committee pair (history allowed)
CREATE UNIQUE INDEX "MemberCommittee_one_active"
  ON "MemberCommittee" ("memberId", "committeeId")
  WHERE "isActive" = true;

-- One ACTIVITY ledger row per attendance (idempotent awards)
CREATE UNIQUE INDEX "PointTransaction_one_activity_award"
  ON "PointTransaction" ("attendanceId")
  WHERE "attendanceId" IS NOT NULL AND "type" = 'ACTIVITY';

-- Global roles (ADMIN / MEMBER) once per member
CREATE UNIQUE INDEX "MemberRole_global_unique"
  ON "MemberRole" ("memberId", "role")
  WHERE "committeeId" IS NULL;

-- Committee-scoped roles (COMMITTEE_LEADER) once per pair
CREATE UNIQUE INDEX "MemberRole_committee_unique"
  ON "MemberRole" ("memberId", "role", "committeeId")
  WHERE "committeeId" IS NOT NULL;
