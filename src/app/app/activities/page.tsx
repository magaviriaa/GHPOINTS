import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, QrCode } from "lucide-react";

import { getMemberActivities } from "@/server/domain/member-reads";
import { formatDateTime } from "@/lib/dates";
import { ACTIVITY_STATUS } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";

export const metadata: Metadata = { title: "Actividades" };

export default async function ActivitiesPage() {
  const { open, seasonActivities } = await getMemberActivities();

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        title="Actividades"
        description="Abiertas para registrar, y todo lo que va de la temporada."
      />

      <section className="space-y-3">
        <SectionHeader title="Abiertas ahora" />
        {open.length === 0 ? (
          <EmptyState
            title="No hay actividades abiertas"
            description="Cuando se abra el registro de una, aparece aquí lista para escanear."
          />
        ) : (
          <ul className="space-y-3">
            {open.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/a/${activity.publicId}`}
                  className="flex items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <QrCode className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-display block truncate font-bold">
                      {activity.name}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {formatDateTime(activity.startsAt)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm font-bold text-accent-ink">
                    +{activity.individualPoints} pts
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Esta temporada" />
        {seasonActivities.length === 0 ? (
          <EmptyState title="Todavía no hay actividades en esta temporada." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {seasonActivities.map((activity) => (
              <li key={activity.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/app/activities/${activity.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {activity.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(activity.startsAt)}
                  </span>
                </span>
                <StatusBadge dictionary={ACTIVITY_STATUS} value={activity.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
