import "dotenv/config";
import { db } from "../src/prisma/db";
import { isoNow, toDateOnly, toIso } from "@/server/db/time";
import type {
  ApprovalMode,
  AttendanceStatus,
  MemberStatus,
  MemberType,
} from "@/server/db/types";
import { createPublicId } from "../src/lib/public-id";
import { slugify } from "../src/lib/text";
import { recomputeActivityScores } from "../src/server/domain/scoring";
import { refreshBadges } from "../src/server/domain/badges";

const COMMITTEES = [
  "A3",
  "AGRO",
  "CAS",
  "CCP",
  "CEP",
  "CIGMA",
  "CIIP",
  "CIMEC",
  "CONEXION",
  "CPF",
  "EPIC",
  "GEMIS",
  "GEO",
  "HOX",
  "PIXEL",
  "TDA",
  "VISION",
];

const FIRST_NAMES = [
  "Camila",
  "Santiago",
  "Valentina",
  "Andres",
  "Mariana",
  "Daniel",
  "Laura",
  "Juan",
  "Sofia",
  "Nicolas",
  "Isabella",
  "Sebastian",
  "Paula",
  "Carlos",
  "Juliana",
  "Mateo",
  "Daniela",
  "Felipe",
  "Ana",
  "David",
  "Catalina",
  "Tomas",
  "Lucia",
  "Esteban",
  "Elena",
];

const LAST_NAMES = [
  "Restrepo",
  "Gomez",
  "Lopez",
  "Martinez",
  "Herrera",
  "Suarez",
  "Ortiz",
  "Ramirez",
  "Castaño",
  "Mejia",
  "Vargas",
  "Rojas",
  "Cardona",
  "Perez",
  "Moreno",
];

const COLORS = [
  "#1e3a5f",
  "#0ea5e9",
  "#d97706",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#0284c7",
  "#ea580c",
];

function domain() {
  return (
    process.env.INSTITUTIONAL_EMAIL_DOMAINS?.split(",")[0]?.trim().toLowerCase() ||
    "universidad.edu.co"
  );
}

function daysFromNow(days: number, hours = 12) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hours, 0, 0, 0);
  return date;
}

async function main() {
  const emailDomain = domain();

  await db.orm.public.PointTransaction.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Attendance.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.CommitteeActivityScore.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.ActivityPublicIdHistory.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Activity.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.MemberCommittee.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.MemberRole.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.IdentityAccount.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Session.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.AuthChallenge.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.AuditLog.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.MemberBadge.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Badge.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.HallOfFameSeason.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.ImportJob.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.AppConfig.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Member.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Committee.where((row) => row.id.isNotNull()).deleteAndCount();
  await db.orm.public.Season.where((row) => row.id.isNotNull()).deleteAndCount();

  await db.orm.public.AppConfig.createAndCount([
    { key: "committee_credit_strategy", value: "FULL_CREDIT" },
    { key: "timezone", value: "America/Bogota" },
  ]);

  const createdCommittees = await db.orm.public.Committee.createAll(
    COMMITTEES.map((name, index) => ({
      name,
      slug: slugify(name),
      color: COLORS[index % COLORS.length],
    }))
  );
  const committeeByName = new Map(
    createdCommittees.map((committee) => [committee.name, committee])
  );
  const committees = COMMITTEES.map((name) => committeeByName.get(name)!);

  const season = await db.orm.public.Season.create({
    name: "2026-2",
    startDate: toDateOnly("2026-07-01"),
    endDate: toDateOnly("2026-12-15"),
    status: "ACTIVE",
  });

  const closedSeason = await db.orm.public.Season.create({
    name: "2026-1",
    startDate: toDateOnly("2026-01-15"),
    endDate: toDateOnly("2026-06-15"),
    status: "CLOSED",
  });

  const seasonJoinAt = toIso(new Date("2026-07-01T00:00:00Z"));

  const admin = await db.orm.public.Member.create({
    fullName: "Camila General",
    institutionalEmail: `gh.general@${emailDomain}`,
    memberType: "ACTIVE",
    roles: (roles) => roles.create([{ role: "ADMIN" }, { role: "MEMBER" }]),
    committees: (memberships) =>
      memberships.create({
        committeeId: committeeByName.get("GEMIS")!.id,
        joinedAt: seasonJoinAt,
      }),
  });

  const members = [admin];
  const gemisLeader = await db.orm.public.Member.create({
    fullName: "Lina Lider",
    institutionalEmail: `lider.gemis@${emailDomain}`,
    memberType: "ACTIVE",
    roles: (roles) =>
      roles.create([
        { role: "MEMBER" },
        { role: "COMMITTEE_LEADER", committeeId: committeeByName.get("GEMIS")!.id },
      ]),
    committees: (memberships) =>
      memberships.create({
        committeeId: committeeByName.get("GEMIS")!.id,
        joinedAt: seasonJoinAt,
      }),
  });
  members.push(gemisLeader);
  for (let i = 0; i < 50; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[i % LAST_NAMES.length]!;
    const extra = LAST_NAMES[(i * 3) % LAST_NAMES.length]!;
    const fullName = `${first} ${last} ${extra}`;
    const memberType: MemberType = i % 4 === 0 ? "NEW" : "ACTIVE";
    const status: MemberStatus = i === 3 ? "ON_LEAVE" : i === 7 ? "HONORARY" : "ACTIVE";
    const committeeCount = i % 7 === 0 ? 3 : i % 5 === 0 ? 2 : 1;
    const start = i % committees.length;
    const assigned = Array.from(
      { length: committeeCount },
      (_, offset) => committees[(start + offset) % committees.length]!
    );

    const member = await db.orm.public.Member.create({
      fullName,
      institutionalEmail: `integrante.${String(i + 1).padStart(2, "0")}@${emailDomain}`,
      memberType,
      status,
      roles: (roles) =>
        roles.create([
          { role: "MEMBER" },
          ...(assigned[0] && i % 13 === 0
            ? [{ role: "COMMITTEE_LEADER" as const, committeeId: assigned[0].id }]
            : []),
        ]),
      committees: (memberships) =>
        memberships.create(
          assigned.map((committee) => ({
            committeeId: committee.id,
            joinedAt: seasonJoinAt,
          }))
        ),
    });
    if (i % 8 === 0) {
      const previous = committees[(start + 8) % committees.length]!;
      if (!assigned.some((committee) => committee.id === previous.id)) {
        await db.orm.public.MemberCommittee.create({
          memberId: member.id,
          committeeId: previous.id,
          joinedAt: toIso(new Date("2026-01-15T00:00:00Z")),
          leftAt: toIso(new Date("2026-06-15T00:00:00Z")),
          isActive: false,
        });
      }
    }
    members.push(member);
  }

  const activityDefs: Array<{
    name: string;
    points: number;
    offset: number;
    approvalMode: ApprovalMode;
    status: "OPEN" | "CLOSED" | "PROCESSED" | "DRAFT";
    type: "SPORTS" | "TALK" | "WORKSHOP" | "SOCIAL" | "GENERAL";
  }> = [
    { name: "Athletic Masculino vs Clubmerc", points: 20, offset: -5, approvalMode: "AUTO", status: "PROCESSED", type: "SPORTS" },
    { name: "Charla de liderazgo", points: 15, offset: -3, approvalMode: "AUTO", status: "CLOSED", type: "TALK" },
    { name: "Torneo interno PIXEL", points: 30, offset: -2, approvalMode: "MANUAL", status: "CLOSED", type: "SPORTS" },
    { name: "Taller de Excel avanzado", points: 10, offset: -1, approvalMode: "AUTO", status: "PROCESSED", type: "WORKSHOP" },
    { name: "Integración de bienvenida", points: 25, offset: 0, approvalMode: "AUTO", status: "OPEN", type: "SOCIAL" },
    { name: "Athletic Femenino vs Clubmerc", points: 20, offset: 2, approvalMode: "AUTO", status: "OPEN", type: "SPORTS" },
    { name: "Reunión general GH", points: 10, offset: 5, approvalMode: "MANUAL", status: "OPEN", type: "GENERAL" },
    { name: "Hackathon VISION", points: 40, offset: 8, approvalMode: "AUTO", status: "DRAFT", type: "WORKSHOP" },
  ];

  const activities = [];
  for (const def of activityDefs) {
    const startsAt = daysFromNow(def.offset, 18);
    const isOpen = def.status === "OPEN";
    const activity = await db.orm.public.Activity.create({
      publicId: createPublicId(),
      seasonId: season.id,
      name: def.name,
      description: `${def.name} — actividad de temporada ${season.name}.`,
      activityType: def.type,
      startsAt: toIso(startsAt),
      registrationStart: isOpen
        ? isoNow(new Date(Date.now() - 24 * 60 * 60 * 1000))
        : toIso(new Date(startsAt.getTime() - 3 * 60 * 60 * 1000)),
      registrationEnd: isOpen
        ? isoNow(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        : toIso(new Date(startsAt.getTime() + 3 * 60 * 60 * 1000)),
      individualPoints: def.points,
      approvalMode: def.approvalMode,
      status: def.status,
      createdById: admin.id,
    });
    activities.push(activity);
  }

  await db.orm.public.Activity.create({
    publicId: createPublicId(),
    seasonId: season.id,
    name: "Taller propuesto GEMIS",
    description: "Propuesta de líder de comité, pendiente de publicación.",
    activityType: "WORKSHOP",
    startsAt: toIso(daysFromNow(10, 18)),
    registrationStart: toIso(daysFromNow(8, 8)),
    registrationEnd: toIso(daysFromNow(10, 21)),
    individualPoints: 15,
    approvalMode: "AUTO",
    status: "DRAFT",
    needsApproval: true,
    committeeId: committeeByName.get("GEMIS")!.id,
    createdById: gemisLeader.id,
  });

  const pastActivities = activities.filter((activity) =>
    ["CLOSED", "PROCESSED"].includes(activity.status)
  );

  for (const activity of pastActivities) {
    const sample = members.filter((_, index) => index % 3 !== 0).slice(0, 18 + (activity.name.length % 10));
    for (const [index, member] of sample.entries()) {
      const status: AttendanceStatus =
        activity.approvalMode === "MANUAL" && index % 8 === 0 ? "PENDING" : "APPROVED";
      const attendance = await db.orm.public.Attendance.create({
        activityId: activity.id,
        memberId: member.id,
        status,
        source: index % 2 === 0 ? "QR" : "LINK",
        registeredAt: toIso(new Date(new Date(activity.startsAt).getTime() + index * 60000)),
        approvedAt: status === "APPROVED" ? activity.startsAt : null,
        approvedById: status === "APPROVED" ? admin.id : null,
      });

      if (status === "APPROVED") {
        await db.orm.public.PointTransaction.create({
          memberId: member.id,
          seasonId: season.id,
          activityId: activity.id,
          attendanceId: attendance.id,
          points: activity.individualPoints,
          type: "ACTIVITY",
          reason: `Asistencia: ${activity.name}`,
          createdById: admin.id,
          createdAt: attendance.registeredAt,
        });
      }
    }
    await recomputeActivityScores(activity.id);
  }

  await db.orm.public.PointTransaction.create({
    memberId: members[2]!.id,
    seasonId: season.id,
    points: 30,
    type: "BONUS",
    reason: "Apoyo logístico en Athletic",
    createdById: admin.id,
  });

  await db.orm.public.Badge.createAndCount([
    { slug: "streak", name: "Racha", description: "Tres actividades consecutivas", type: "STREAK" },
    { slug: "500-points", name: "500 GH Points", description: "Alcanza 500 puntos en la temporada", type: "POINTS" },
    { slug: "top-10", name: "Top 10", description: "Termina en el top 10 de tu tablero", type: "TOP" },
    { slug: "monthly-mvp", name: "MVP del mes", description: "Más GH Points del mes", type: "MVP" },
    { slug: "committee-leader", name: "Líder de comité", description: "Lideras un comité", type: "LEADER" },
  ]);

  await db.orm.public.HallOfFameSeason.create({
    seasonId: closedSeason.id,
    top3Active: [
      { fullName: "Camila General", total: 120, rank: 1 },
      { fullName: "Lina Lider", total: 90, rank: 2 },
      { fullName: "Ana Demo", total: 80, rank: 3 },
    ],
    top3New: [{ fullName: "Sofia Nueva", total: 40, rank: 1 }],
    top3Committees: [{ name: "GEMIS", slug: "gemis", total: 0.42, rank: 1 }],
    stats: {
      activeMembers: 40,
      newMembers: 12,
      activities: 8,
      attendances: 96,
      pointsAwarded: 1400,
    },
  });

  await refreshBadges({ seasonId: season.id });

  console.info(`Seed OK. Admin: gh.general@${emailDomain} (OTP_FIXED_CODE en desarrollo)`);
  console.info(`Líder GEMIS: lider.gemis@${emailDomain}`);
  console.info(`Integrantes: ${members.length}. Actividades: ${activities.length}.`);
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
