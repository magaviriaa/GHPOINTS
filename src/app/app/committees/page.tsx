import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { requirePageActor } from "@/server/auth/guard";
import { canOpenLeaderArea } from "@/server/domain/authorization";
import { listLeaderCommittees } from "@/server/domain/leader-reads";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";

export const metadata: Metadata = { title: "Mis comités" };

export default async function LeaderCommitteesPage() {
  const actor = await requirePageActor();

  if (!canOpenLeaderArea(actor)) {
    return (
      <div className="space-y-6">
        <SectionHeader as="h1" title="Mis comités" />
        <EmptyState
          title="No lideras un comité"
          description="El roster y la participación de un comité solo los ve su líder o GH General."
        />
      </div>
    );
  }

  const committees = await listLeaderCommittees(actor);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Mis comités"
        description="Roster, participación y propuestas de actividad."
      />
      {committees.length === 0 ? (
        <EmptyState title="No hay comités para mostrar." />
      ) : (
        <ul className="space-y-3">
          {committees.map((committee) => (
            <li key={committee.slug}>
              <Link
                href={`/app/committees/${committee.slug}`}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <span
                  className="h-9 w-1.5 shrink-0 rounded-full"
                  style={{ background: committee.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="font-display block truncate font-bold">
                    {committee.name}
                  </span>
                  <span className="tnum block text-sm text-muted-foreground">
                    {committee._count.memberships} integrantes
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
