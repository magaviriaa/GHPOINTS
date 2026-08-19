import "dotenv/config";
import {
  ApprovalMode,
  AttendanceSource,
  AttendanceStatus,
  MemberType,
  PrismaClient,
} from "@prisma/client";
import { createPublicId } from "../src/lib/public-id";
import { slugify } from "../src/lib/text";
import { recomputeActivityScores } from "../src/server/domain/scoring";
import { refreshBadges } from "../src/server/domain/badges";

const prisma = new PrismaClient();

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

  await prisma.pointTransaction.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.committeeActivityScore.deleteMany();
  await prisma.activityPublicIdHistory.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.memberCommittee.deleteMany();
  await prisma.memberRole.deleteMany();
  await prisma.identityAccount.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authChallenge.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.memberBadge.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.hallOfFameSeason.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.appConfig.deleteMany();
  await prisma.member.deleteMany();
  await prisma.committee.deleteMany();
  await prisma.season.deleteMany();

  await prisma.appConfig.createMany({
    data: [
      { key: "committee_credit_strategy", value: "FULL_CREDIT" },
      { key: "timezone", value: "America/Bogota" },
    ],
  });

  const committees = await Promise.all(
    COMMITTEES.map((name, index) =>
      prisma.committee.create({
        data: {
          name,
          slug: slugify(name),
          color: COLORS[index % COLORS.length],
        },
      })
    )
  );

  const committeeByName = new Map(committees.map((committee) => [committee.name, committee]));

  const season = await prisma.season.create({
    data: {
      name: "2026-2",
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-12-15"),
      status: "ACTIVE",
    },
  });

  const closedSeason = await prisma.season.create({
    data: {
      name: "2026-1",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2026-06-15"),
      status: "CLOSED",
    },
  });

  const admin = await prisma.member.create({
    data: {
      fullName: "Camila General",
      institutionalEmail: `gh.general@${emailDomain}`,
      memberType: "ACTIVE",
      roles: {
        create: [{ role: "ADMIN" }, { role: "MEMBER" }],
      },
      committees: {
        create: { committeeId: committeeByName.get("GEMIS")!.id },
      },
    },
  });

  const members = [admin];
  const gemisLeader = await prisma.member.create({
    data: {
      fullName: "Lina Lider",
      institutionalEmail: `lider.gemis@${emailDomain}`,
      memberType: "ACTIVE",
      roles: {
        create: [
          { role: "MEMBER" },
          { role: "COMMITTEE_LEADER", committeeId: committeeByName.get("GEMIS")!.id },
        ],
      },
      committees: {
        create: { committeeId: committeeByName.get("GEMIS")!.id },
      },
    },
  });
  members.push(gemisLeader);
  for (let i = 0; i < 50; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last = LAST_NAMES[i % LAST_NAMES.length]!;
    const extra = LAST_NAMES[(i * 3) % LAST_NAMES.length]!;
    const fullName = `${first} ${last} ${extra}`;
    const memberType: MemberType = i % 4 === 0 ? "NEW" : "ACTIVE";
    const committeeCount = i % 7 === 0 ? 3 : i % 5 === 0 ? 2 : i % 11 === 0 ? 0 : 1;
    const start = i % committees.length;
    const assigned = Array.from({ length: committeeCount }, (_, offset) => committees[(start + offset) % committees.length]!);

    const member = await prisma.member.create({
      data: {
        fullName,
        institutionalEmail: `integrante.${String(i + 1).padStart(2, "0")}@${emailDomain}`,
        memberType,
        roles: {
          create: [
            { role: "MEMBER" },
            ...(assigned[0] && i % 13 === 0
              ? [{ role: "COMMITTEE_LEADER" as const, committeeId: assigned[0].id }]
              : []),
          ],
        },
        committees: {
          create: assigned.map((committee) => ({ committeeId: committee.id })),
        },
      },
    });
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
    const activity = await prisma.activity.create({
      data: {
        publicId: createPublicId(),
        seasonId: season.id,
        name: def.name,
        description: `${def.name} — actividad de temporada ${season.name}.`,
        activityType: def.type,
        startsAt,
        registrationStart: isOpen ? new Date(Date.now() - 24 * 60 * 60 * 1000) : new Date(startsAt.getTime() - 3 * 60 * 60 * 1000),
        registrationEnd: isOpen ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : new Date(startsAt.getTime() + 3 * 60 * 60 * 1000),
        individualPoints: def.points,
        approvalMode: def.approvalMode,
        status: def.status,
        createdById: admin.id,
      },
    });
    activities.push(activity);
  }

  await prisma.activity.create({
    data: {
      publicId: createPublicId(),
      seasonId: season.id,
      name: "Taller propuesto GEMIS",
      description: "Propuesta de líder de comité, pendiente de publicación.",
      activityType: "WORKSHOP",
      startsAt: daysFromNow(10, 18),
      registrationStart: daysFromNow(8, 8),
      registrationEnd: daysFromNow(10, 21),
      individualPoints: 15,
      approvalMode: "AUTO",
      status: "DRAFT",
      needsApproval: true,
      committeeId: committeeByName.get("GEMIS")!.id,
      createdById: gemisLeader.id,
    },
  });

  const pastActivities = activities.filter((activity) =>
    ["CLOSED", "PROCESSED"].includes(activity.status)
  );

  for (const activity of pastActivities) {
    const sample = members.filter((_, index) => index % 3 !== 0).slice(0, 18 + (activity.name.length % 10));
    for (const [index, member] of sample.entries()) {
      const status: AttendanceStatus =
        activity.approvalMode === "MANUAL" && index % 8 === 0 ? "PENDING" : "APPROVED";
      const attendance = await prisma.attendance.create({
        data: {
          activityId: activity.id,
          memberId: member.id,
          status,
          source: index % 2 === 0 ? AttendanceSource.QR : AttendanceSource.LINK,
          registeredAt: new Date(activity.startsAt.getTime() + index * 60000),
          approvedAt: status === "APPROVED" ? activity.startsAt : null,
          approvedById: status === "APPROVED" ? admin.id : null,
        },
      });

      if (status === "APPROVED") {
        await prisma.pointTransaction.create({
          data: {
            memberId: member.id,
            seasonId: season.id,
            activityId: activity.id,
            attendanceId: attendance.id,
            points: activity.individualPoints,
            type: "ACTIVITY",
            reason: `Asistencia: ${activity.name}`,
            createdById: admin.id,
            createdAt: attendance.registeredAt,
          },
        });
      }
    }
    await recomputeActivityScores(activity.id);
  }

  await prisma.pointTransaction.create({
    data: {
      memberId: members[2]!.id,
      seasonId: season.id,
      points: 30,
      type: "BONUS",
      reason: "Apoyo logístico en Athletic",
      createdById: admin.id,
    },
  });

  await prisma.badge.createMany({
    data: [
      { slug: "streak", name: "Racha", description: "Tres actividades consecutivas", type: "STREAK" },
      { slug: "500-points", name: "500 GH Points", description: "Alcanza 500 puntos en la temporada", type: "POINTS" },
      { slug: "top-10", name: "Top 10", description: "Termina en el top 10 de tu tablero", type: "TOP" },
      { slug: "monthly-mvp", name: "MVP del mes", description: "Más GH Points del mes", type: "MVP" },
      { slug: "committee-leader", name: "Líder de comité", description: "Lideras un comité", type: "LEADER" },
    ],
  });

  await prisma.hallOfFameSeason.create({
    data: {
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
    },
  });

  await refreshBadges({ seasonId: season.id });

  console.info(`Seed OK. Admin: gh.general@${emailDomain} (OTP_FIXED_CODE en desarrollo)`);
  console.info(`Líder GEMIS: lider.gemis@${emailDomain}`);
  console.info(`Integrantes: ${members.length}. Actividades: ${activities.length}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
