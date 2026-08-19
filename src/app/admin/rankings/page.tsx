import { getCommitteeRanking, getIndividualRanking } from "@/server/domain/ranking";
import { Podium, RankingList } from "@/components/podium/podium";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";

export default async function AdminRankingsPage() {
  const [active, newer, committees] = await Promise.all([
    getIndividualRanking({ board: "ACTIVE" }),
    getIndividualRanking({ board: "NEW" }),
    getCommitteeRanking(),
  ]);

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        title="Rankings"
        description="Tableros de la temporada activa."
        action={<ExportLinks type="rankings" what="los rankings" />}
      />

      <section className="space-y-3">
        <SectionHeader title="Activos" />
        {active.entries.length === 0 ? (
          <EmptyState title="Sin puntos en el tablero de activos." />
        ) : (
          <>
            <Podium
              items={active.entries.slice(0, 3).map((entry) => ({
                id: entry.memberId,
                name: entry.fullName,
                total: entry.total,
              }))}
            />
            <RankingList
              items={active.entries.map((entry) => ({
                id: entry.memberId,
                name: entry.fullName,
                total: entry.total,
                rank: entry.rank,
              }))}
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Nuevos" />
        {newer.entries.length === 0 ? (
          <EmptyState title="Sin puntos en el tablero de nuevos." />
        ) : (
          <RankingList
            items={newer.entries.map((entry) => ({
              id: entry.memberId,
              name: entry.fullName,
              total: entry.total,
              rank: entry.rank,
            }))}
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Comités" />
        {committees.entries.length === 0 ? (
          <EmptyState title="El score de comité aparece al cerrar actividades." />
        ) : (
          <RankingList
            unit="%"
            items={committees.entries.map((entry) => ({
              id: entry.committeeId,
              name: entry.name,
              total: entry.total,
              rank: entry.rank,
              color: entry.color,
              subtitle: `${entry.activities} actividades`,
            }))}
          />
        )}
      </section>
    </div>
  );
}
