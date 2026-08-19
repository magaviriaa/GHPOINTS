import { formatDate } from "@/lib/dates";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { EmptyState } from "@/components/ui-blocks";
import { listHallOfFameSeasons } from "@/server/domain/hall-of-fame";
import type { HallOfFameSnapshot } from "@/server/domain/hall-of-fame-pure";

const METAL = ["var(--metal-oro)", "var(--metal-plata)", "var(--metal-bronce)"];

function Row({
  rank,
  name,
  value,
}: {
  rank: number;
  name: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span
        className="font-display size-6 shrink-0 rounded-full text-center text-xs leading-6 font-extrabold text-tinta/75"
        style={{ background: METAL[rank - 1] ?? "var(--muted)" }}
        aria-hidden
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">Puesto {rank}: </span>
        {name}
      </span>
      <span className="tnum font-bold">{value}</span>
    </li>
  );
}

function Board({
  title,
  people,
}: {
  title: string;
  people: HallOfFameSnapshot["top3Active"];
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {title}
      </h3>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ganadores.</p>
      ) : (
        <ol className="divide-y overflow-hidden rounded-lg border bg-background">
          {people.map((person) => (
            <Row
              key={`${person.fullName}-${person.rank}`}
              rank={person.rank}
              name={person.fullName}
              value={String(person.total)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Las temporadas cerradas. La página que las envuelve pone el encabezado. */
export async function HallOfFameBoards() {
  const seasons = await listHallOfFameSeasons();

  if (seasons.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay temporadas cerradas"
        description="Al cerrar una temporada queda su foto: los tres primeros de cada tablero y los comités."
      />
    );
  }

  return (
    <div className="space-y-6">
      {seasons.map((row) => (
        <article key={row.id} className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/40 px-4 py-4">
            <h2 className="font-display text-xl font-extrabold tracking-tight">
              {row.seasonName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(row.startDate)} — {formatDate(row.endDate)}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Asistencias</dt>
                <dd className="tnum font-semibold">{row.snapshot.stats.attendances}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">GH Points</dt>
                <dd className="tnum font-semibold">{row.snapshot.stats.pointsAwarded}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Actividades</dt>
                <dd className="tnum font-semibold">{row.snapshot.stats.activities}</dd>
              </div>
            </dl>
          </div>
          <div className="grid gap-5 p-4 sm:grid-cols-3">
            <Board title="Activos" people={row.snapshot.top3Active} />
            <Board title="Nuevos" people={row.snapshot.top3New} />
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Comités
              </h3>
              {row.snapshot.top3Committees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin score de comité.</p>
              ) : (
                <ol className="divide-y overflow-hidden rounded-lg border bg-background">
                  {row.snapshot.top3Committees.map((committee) => (
                    <Row
                      key={committee.slug}
                      rank={committee.rank}
                      name={committee.name}
                      value={`${roundRateDisplay(committee.total)}%`}
                    />
                  ))}
                </ol>
              )}
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
