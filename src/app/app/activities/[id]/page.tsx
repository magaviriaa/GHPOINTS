import { notFound } from "next/navigation";
import { CalendarDays, Users } from "lucide-react";

import { getPublishedActivityById } from "@/server/domain/activities";
import { countApprovedAttendances } from "@/server/domain/attendance";
import { listActivityCommitteeScores } from "@/server/domain/scoring";
import { formatDateTime } from "@/lib/dates";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { ACTIVITY_STATUS } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui-blocks";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activity = await getPublishedActivityById(id);
  if (!activity) notFound();

  const [scores, approved] = await Promise.all([
    listActivityCommitteeScores(activity.id),
    countApprovedAttendances(activity.id),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge dictionary={ACTIVITY_STATUS} value={activity.status} />
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
            {formatDateTime(activity.startsAt)}
          </span>
        </div>
        <h1 className="font-display mt-2 text-2xl font-extrabold tracking-tight">
          {activity.name}
        </h1>
        {activity.description ? (
          <p className="mt-2 text-muted-foreground">{activity.description}</p>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Asistentes" value={approved} hint="Asistencias aprobadas" />
        <StatCard label="Vale" value={`+${activity.individualPoints}`} hint="GH Points" />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Participación por comité"
          description="Asistentes del comité sobre sus integrantes elegibles."
        />
        {scores.length === 0 ? (
          <EmptyState
            title="Todavía no hay participación registrada"
            description="El score de comité se calcula cuando la actividad se cierra."
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {scores.map((score) => (
              <li key={score.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: score.committee.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{score.committee.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3.5" aria-hidden />
                  {score.eligibleMemberCount}
                </span>
                <span className="tnum w-16 text-right font-bold">
                  {roundRateDisplay(Number(score.participationRate))}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
