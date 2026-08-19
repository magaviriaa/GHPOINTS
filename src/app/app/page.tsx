import Link from "next/link";
import { ArrowRight, QrCode } from "lucide-react";

import { requirePageActor } from "@/server/auth/guard";
import { getMemberHome } from "@/server/domain/member-reads";
import { firstName } from "@/lib/text";
import { formatDateTime } from "@/lib/dates";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { EmptyState, LevelTrack, Marcador, SectionHeader } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";

export default async function AppHomePage() {
  const actor = await requirePageActor();
  const home = await getMemberHome(actor.id);
  const bestCommittee = home.committeeStandings[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          Hola, {firstName(actor.fullName)}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {home.season ? `Temporada ${home.season.name}` : "No hay temporada activa"}
        </p>
      </div>

      {/* El marcador: la cifra que la persona vino a ver, y qué falta para la siguiente. */}
      <section className="banda-marcador overflow-hidden rounded-xl p-5 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <Marcador label="GH Points" value={home.points} size="lg" onBand />
          <Marcador
            label="Ranking general"
            value={home.standing?.rank ? `#${home.standing.rank}` : "—"}
            hint={
              home.standing?.rank
                ? `de ${home.standing.boardSize} en ${
                    home.standing.memberType === "NEW" ? "nuevos" : "activos"
                  }`
                : "Suma tus primeros puntos para entrar al tablero"
            }
            onBand
          />
        </div>
        <LevelTrack className="mt-7" level={home.level} points={home.points} onBand />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Próxima actividad" />
        {home.nextActivity ? (
          <Link
            href={`/a/${home.nextActivity.publicId}`}
            className="block rounded-xl border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-hidden
              >
                <QrCode className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display truncate font-bold">{home.nextActivity.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(home.nextActivity.startsAt)}
                </p>
              </div>
              <span className="tnum shrink-0 text-sm font-bold text-accent-ink">
                +{home.nextActivity.individualPoints} pts
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </div>
          </Link>
        ) : (
          <EmptyState
            title="No hay actividades abiertas"
            description="Cuando GH General publique una, aparece aquí y en Actividades."
            action={
              <Button asChild variant="secondary">
                <Link href="/app/activities">Ver la temporada</Link>
              </Button>
            }
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Tus comités"
          action={
            bestCommittee ? (
              <Link
                href="/app/rankings"
                className="text-sm font-medium text-primary hover:underline hover:underline-offset-4"
              >
                Ver el ranking
              </Link>
            ) : undefined
          }
        />
        {home.committeeStandings.length === 0 ? (
          <EmptyState
            title="Todavía no estás en un comité"
            description="La participación de comité se calcula sobre quienes son miembros. Habla con GH General para que te asignen."
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {home.committeeStandings.map((item) => (
              <li key={item.committee.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ background: item.committee.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {item.committee.name}
                </span>
                <span className="tnum text-sm font-semibold">
                  {item.rank ? `#${item.rank}` : "sin score"}
                </span>
                <span className="tnum w-14 text-right text-sm text-muted-foreground">
                  {item.rank ? `${roundRateDisplay(item.total)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Movimientos recientes"
          action={
            home.recent.length > 0 ? (
              <Link
                href="/app/me"
                className="text-sm font-medium text-primary hover:underline hover:underline-offset-4"
              >
                Ver historial
              </Link>
            ) : undefined
          }
        />
        {home.recent.length === 0 ? (
          <EmptyState
            title="Todavía no tienes GH Points"
            description="Escanea el QR de una actividad y tu primer movimiento aparece aquí."
            action={
              <Button asChild>
                <Link href="/app/activities">Ver actividades</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {home.recent.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {row.activity?.name ?? row.reason}
                </span>
                <span
                  className={`tnum font-semibold ${
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
