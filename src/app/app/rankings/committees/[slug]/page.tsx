import { notFound } from "next/navigation";

import { getCommitteeDetail } from "@/server/domain/committees";
import { getCommitteeRanking } from "@/server/domain/ranking";
import { averageRate, roundRateDisplay } from "@/server/domain/scoring-pure";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui-blocks";

export default async function CommitteeRankPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const committee = await getCommitteeDetail(slug);
  if (!committee) notFound();
  const ranking = await getCommitteeRanking();
  const entry = ranking.entries.find((item) => item.committeeId === committee.id);
  const avg = averageRate(committee.scores.map((score) => Number(score.participationRate)));

  return (
    <div className="space-y-8">
      <h1 className="font-display flex items-center gap-2.5 text-2xl font-extrabold tracking-tight">
        <span
          className="h-7 w-1.5 rounded-full"
          style={{ background: committee.color }}
          aria-hidden
        />
        {committee.name}
      </h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Integrantes" value={committee.memberships.length} />
        <StatCard label="Posición" value={entry?.rank ? `#${entry.rank}` : "—"} />
        <StatCard label="Participación" value={`${roundRateDisplay(avg)}%`} hint="Promedio" />
        <StatCard label="Actividades" value={committee.scores.length} />
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Actividad por actividad"
          description="Qué tanto del comité asistió a cada una."
        />
        {committee.scores.length === 0 ? (
          <EmptyState title="Todavía no hay actividades cerradas para este comité." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {committee.scores.map((score) => {
              const rate = Number(score.participationRate);
              return (
                <li key={score.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{score.activity.name}</span>
                    <span className="tnum w-16 text-right font-bold">
                      {roundRateDisplay(rate)}%
                    </span>
                  </div>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, rate * 100))}%`,
                        background: committee.color,
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
