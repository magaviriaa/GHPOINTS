import { notFound } from "next/navigation";

import { requirePageActor } from "@/server/auth/guard";
import { ErrorCodes, isDomainError } from "@/server/domain/errors";
import { getCommitteeLeaderView } from "@/server/domain/leader-reads";
import { listLeaderProposedActivities } from "@/server/domain/activities";
import { leaderProposeActivityAction } from "@/server/actions/leader";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/dates";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { ACTIVITY_STATUS, MEMBER_STATUS, MEMBER_TYPE } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader, StatCard } from "@/components/ui-blocks";

export default async function CommitteeLeaderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const actor = await requirePageActor();
  const { slug } = await params;

  let view;
  try {
    view = await getCommitteeLeaderView(actor, slug);
  } catch (error) {
    if (
      isDomainError(error) &&
      (error.code === ErrorCodes.NOT_FOUND || error.code === ErrorCodes.FORBIDDEN)
    ) {
      notFound();
    }
    throw error;
  }

  const proposals = await listLeaderProposedActivities(actor, view.committee.id);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Roster de comité
        </p>
        <h1 className="font-display mt-1 flex items-center gap-2.5 text-2xl font-extrabold tracking-tight">
          <span
            className="h-7 w-1.5 rounded-full"
            style={{ background: view.committee.color }}
            aria-hidden
          />
          {view.committee.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.season ? `Temporada ${view.season.name}` : "Sin temporada activa"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Integrantes" value={view.roster.length} />
        <StatCard label="Posición" value={view.standing?.rank ? `#${view.standing.rank}` : "—"} />
        <StatCard
          label="Participación"
          value={view.standing ? `${roundRateDisplay(view.standing.total)}%` : "—"}
        />
        <StatCard label="Actividades" value={view.standing?.activities ?? 0} />
      </div>

      <details className="overflow-hidden rounded-xl border bg-card">
        <summary className="cursor-pointer px-4 py-3 font-medium">Proponer actividad</summary>
        <div className="border-t px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Queda en borrador hasta que GH General la publique.
          </p>
          <ClientForm
            action={leaderProposeActivityAction}
            className="mt-4 grid gap-3 md:grid-cols-2"
            successMessage="Propuesta enviada a aprobación."
            resetOnSuccess
          >
            <input type="hidden" name="committeeId" value={view.committee.id} />
            <input type="hidden" name="committeeSlug" value={view.committee.slug} />
            <Field label="Nombre" htmlFor="name" span>
              <Input id="name" name="name" required />
            </Field>
            <Field label="Inicio" htmlFor="startsAt">
              <Input id="startsAt" name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="GH Points" htmlFor="individualPoints">
              <Input
                id="individualPoints"
                name="individualPoints"
                type="number"
                defaultValue={10}
                required
              />
            </Field>
            <Field label="Registro desde" htmlFor="registrationStart">
              <Input
                id="registrationStart"
                name="registrationStart"
                type="datetime-local"
                required
              />
            </Field>
            <Field label="Registro hasta" htmlFor="registrationEnd">
              <Input id="registrationEnd" name="registrationEnd" type="datetime-local" required />
            </Field>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="Enviando…">Enviar a aprobación</SubmitButton>
            </div>
          </ClientForm>

          {proposals.length > 0 ? (
            <ul className="mt-5 divide-y rounded-lg border">
              {proposals.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                  {activity.needsApproval ? (
                    <span className="text-xs text-muted-foreground">en cola</span>
                  ) : null}
                  <StatusBadge dictionary={ACTIVITY_STATUS} value={activity.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>

      <section className="space-y-3">
        <SectionHeader title="Roster" />
        {view.roster.length === 0 ? (
          <EmptyState title="Este comité no tiene integrantes activos." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {view.roster.map((member, index) => (
              <li
                key={`${member.fullName}-${member.joinedAt.toISOString()}-${index}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    desde {formatDate(member.joinedAt)}
                  </span>
                </span>
                <StatusBadge dictionary={MEMBER_TYPE} value={member.memberType} />
                <StatusBadge dictionary={MEMBER_STATUS} value={member.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Participación por actividad"
          description="Asistentes del comité sobre los elegibles cuando la actividad cerró."
        />
        {view.scores.length === 0 ? (
          <EmptyState title="Todavía no hay actividades cerradas para este comité." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {view.scores.map((score) => (
              <li key={score.activityName} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm">{score.activityName}</span>
                <span className="tnum text-xs text-muted-foreground">
                  {score.attendeeCredit.toFixed(1)}/{score.eligibleMemberCount}
                </span>
                <span className="tnum w-16 text-right font-bold">
                  {roundRateDisplay(score.participationRate)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
