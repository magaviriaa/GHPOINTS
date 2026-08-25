import type { Metadata } from "next";
import { Award } from "lucide-react";

import { requirePageActor } from "@/server/auth/guard";
import { getMemberProfile } from "@/server/domain/member-reads";
import { splitMemberships } from "@/server/domain/members-pure";
import { formatDateTime } from "@/lib/dates";
import { MEMBER_STATUS, MEMBER_TYPE, POINT_TRANSACTION_TYPE } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  EmptyState,
  Initials,
  LevelTrack,
  Marcador,
  SectionHeader,
} from "@/components/ui-blocks";
import { MembershipHistory } from "@/components/members/membership-history";
import { CommitteeCreditNote } from "@/components/members/committee-credit-note";

export const metadata: Metadata = { title: "Perfil" };

export default async function MePage() {
  const actor = await requirePageActor();
  const profile = await getMemberProfile(actor.id);

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-4">
        <Initials name={actor.fullName} className="size-14 text-lg" />
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl font-extrabold tracking-tight">
            {actor.fullName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge dictionary={MEMBER_TYPE} value={actor.memberType} />
            <StatusBadge dictionary={MEMBER_STATUS} value={actor.status} />
            <span className="text-sm text-muted-foreground">
              {profile.season ? `Temporada ${profile.season.name}` : "Sin temporada activa"}
            </span>
          </div>
        </div>
      </header>

      <section className="banda-marcador overflow-hidden rounded-xl p-5 pb-6">
        <Marcador label="GH Points" value={profile.points} size="lg" onBand />
        <LevelTrack className="mt-6" level={profile.level} points={profile.points} onBand />
      </section>

      <MembershipHistory memberships={profile.memberships} />

      <CommitteeCreditNote
        strategy={profile.creditStrategy}
        committeeNames={splitMemberships(profile.memberships).current.map(
          (item) => item.committee.name
        )}
      />

      <section className="space-y-3">
        <SectionHeader title="Logros" />
        {profile.badges.length === 0 ? (
          <EmptyState
            title="Todavía no tienes logros"
            description="Se desbloquean por racha de asistencia, por total de GH Points y por entrar al top del tablero."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.badges.map((item) => (
              <li key={item.id} className="flex gap-3 rounded-xl border bg-card p-4">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-ink"
                  aria-hidden
                >
                  <Award className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="font-display block font-bold">{item.badge.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {item.badge.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Historial" description="Todo lo que sumó o restó esta temporada." />
        {profile.history.length === 0 ? (
          <EmptyState
            title="Todavía no tienes GH Points"
            description="Tu primer registro de asistencia abre el historial."
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {profile.history.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.reason}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2">
                    <StatusBadge dictionary={POINT_TRANSACTION_TYPE} value={row.type} />
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </span>
                  </span>
                </span>
                <span
                  className={`tnum shrink-0 font-bold ${
                    row.points < 0 ? "text-destructive" : "text-success-ink"
                  }`}
                >
                  {row.points > 0 ? "+" : ""}
                  {row.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
