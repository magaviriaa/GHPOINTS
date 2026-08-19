import type { Metadata } from "next";

import { requirePageActor } from "@/server/auth/guard";
import { getCommitteeRanking, getIndividualRanking } from "@/server/domain/ranking";
import { EmptyState, SectionHeader, SegmentedLinks } from "@/components/ui-blocks";
import { Podium, RankingList } from "@/components/podium/podium";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { recentIsoWeekIds } from "@/lib/dates";

export const metadata: Metadata = { title: "Podio" };

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; isoWeek?: string }>;
}) {
  const { period, isoWeek } = await searchParams;
  const actor = await requirePageActor();
  const weeks = recentIsoWeekIds(8);
  const [active, newer, committees] = await Promise.all([
    getIndividualRanking({ board: "ACTIVE", period, isoWeek }),
    getIndividualRanking({ board: "NEW", period, isoWeek }),
    getCommitteeRanking(),
  ]);

  const periods = [
    { href: "/app/rankings", label: "Temporada", active: !period || period === "season" },
    { href: "/app/rankings?period=month", label: "Mes", active: period === "month" },
    { href: "/app/rankings?period=week", label: "Semana", active: period === "week" },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader as="h1" title="Podio" description="Quién va adelante en la temporada." />

      <div className="space-y-3">
        <SegmentedLinks label="Periodo del ranking" items={periods} />
        {period === "week" ? (
          <form className="flex flex-wrap items-end gap-2" method="get">
            <input type="hidden" name="period" value="week" />
            <div className="space-y-1.5">
              <label htmlFor="isoWeek" className="block text-sm font-medium">
                Semana ISO
              </label>
              <NativeSelect
                id="isoWeek"
                name="isoWeek"
                defaultValue={isoWeek ?? weeks[0]}
                className="w-40"
              >
                {weeks.map((week) => (
                  <option key={week} value={week}>
                    {week}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" variant="secondary">
              Ver semana
            </Button>
          </form>
        ) : null}
      </div>

      <Tabs defaultValue="active">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">Activos</TabsTrigger>
          <TabsTrigger value="new">Nuevos</TabsTrigger>
          <TabsTrigger value="committees">Comités</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {active.entries.length === 0 ? (
            <EmptyState
              title="El tablero de activos está en cero"
              description="Aparece en cuanto se acredite la primera asistencia del periodo."
            />
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
                highlightId={actor.id}
                items={active.entries.map((entry) => ({
                  id: entry.memberId,
                  name: entry.fullName,
                  total: entry.total,
                  rank: entry.rank,
                }))}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="new" className="space-y-4">
          {newer.entries.length === 0 ? (
            <EmptyState
              title="El tablero de nuevos está en cero"
              description="Aparece en cuanto se acredite la primera asistencia del periodo."
            />
          ) : (
            <>
              <Podium
                items={newer.entries.slice(0, 3).map((entry) => ({
                  id: entry.memberId,
                  name: entry.fullName,
                  total: entry.total,
                }))}
              />
              <RankingList
                highlightId={actor.id}
                items={newer.entries.map((entry) => ({
                  id: entry.memberId,
                  name: entry.fullName,
                  total: entry.total,
                  rank: entry.rank,
                }))}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="committees" className="space-y-4">
          {committees.entries.length === 0 ? (
            <EmptyState
              title="Todavía no hay score de comités"
              description="Se calcula cuando GH General cierra una actividad."
            />
          ) : (
            <>
              <Podium
                unit="%"
                items={committees.entries.slice(0, 3).map((entry) => ({
                  id: entry.committeeId,
                  name: entry.name,
                  total: entry.total,
                  color: entry.color,
                }))}
              />
              <RankingList
                unit="%"
                items={committees.entries.map((entry) => ({
                  id: entry.committeeId,
                  name: entry.name,
                  total: entry.total,
                  rank: entry.rank,
                  color: entry.color,
                  subtitle: `${entry.activities} actividades`,
                  href: `/app/rankings/committees/${entry.slug}`,
                }))}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
