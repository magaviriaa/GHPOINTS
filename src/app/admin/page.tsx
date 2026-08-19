import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { getAdminOverview, getInactiveMembers } from "@/server/domain/analytics";
import { BarList, SectionHeader, StatCard } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { plural } from "@/lib/text";

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();
  const inactive = await getInactiveMembers(21);

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        title="Overview"
        description={
          overview.season ? `Temporada ${overview.season.name}` : "Sin temporada activa"
        }
        action={
          overview.kpis.pending > 0 ? (
            <Button asChild size="sm">
              <Link href="/admin/attendance">
                Revisar {overview.kpis.pending} pendientes
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Integrantes activos" value={overview.kpis.activeMembers} />
        <StatCard label="Nuevos" value={overview.kpis.newMembers} />
        <StatCard label="Comités" value={overview.kpis.committees} />
        <StatCard label="Actividades" value={overview.kpis.activities} />
        <StatCard label="Asistencias temporada" value={overview.kpis.seasonAttendances} />
        <StatCard label="GH Points entregados" value={overview.kpis.pointsAwarded} />
        <StatCard
          label="Registros pendientes"
          value={overview.kpis.pending}
          accent={overview.kpis.pending > 0}
        />
        <StatCard
          label="Comité líder"
          value={overview.kpis.leadingCommittee?.name ?? "—"}
          hint={
            overview.kpis.leadingCommittee
              ? `${roundRateDisplay(overview.kpis.leadingCommittee.total)}% de participación`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionHeader title="Puntos por semana" />
          <div className="rounded-xl border bg-card p-4">
            <BarList
              items={overview.pointsByWeek.map((row) => ({
                id: String(row.week),
                label: new Date(row.week).toLocaleDateString("es-CO"),
                value: row.points,
              }))}
              emptyLabel="Sin puntos entregados en la temporada."
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader title="Asistencia por actividad" />
          <div className="rounded-xl border bg-card p-4">
            <BarList
              items={overview.attendanceByActivity.map((activity) => ({
                id: activity.id,
                label: activity.name,
                value: activity.attendances,
              }))}
              emptyLabel="Ninguna actividad tiene asistencias todavía."
            />
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Participación de comités"
          description="Promedio de las actividades cerradas."
        />
        <div className="rounded-xl border bg-card p-4">
          <BarList
            unit="%"
            items={overview.committeeRanking.map((entry) => ({
              id: entry.committeeId,
              label: entry.name,
              value: Number(roundRateDisplay(entry.total)),
              color: entry.color,
            }))}
            emptyLabel="El score aparece al cerrar la primera actividad."
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Sin actividad reciente"
          description="Integrantes activos que no registran asistencia hace 21 días."
          action={
            <span className="tnum text-sm font-semibold text-muted-foreground">
              {plural(inactive.length, "integrante")}
            </span>
          }
        />
        {inactive.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Todos los integrantes activos registraron algo en las últimas tres semanas.
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {inactive.slice(0, 12).map((member) => (
              <li key={member.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <AlertTriangle className="size-3.5 shrink-0 text-accent-ink" aria-hidden />
                <Link href={`/admin/members/${member.id}`} className="hover:underline">
                  {member.fullName}
                </Link>
              </li>
            ))}
            {inactive.length > 12 ? (
              <li className="px-4 py-2.5 text-sm text-muted-foreground">
                y {inactive.length - 12} más
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  );
}
