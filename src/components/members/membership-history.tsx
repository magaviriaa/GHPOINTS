import { formatDate } from "@/lib/dates";
import { SectionHeader } from "@/components/ui-blocks";
import { splitMemberships } from "@/server/domain/members-pure";

export type MembershipRow = {
  id: string;
  isActive: boolean;
  joinedAt: Date | string;
  leftAt: Date | string | null;
  committee: { id: string; name: string; color: string };
};

function periodLabel(joinedAt: Date | string, leftAt: Date | string | null): string {
  if (!leftAt) return `desde ${formatDate(joinedAt)}`;
  return `${formatDate(joinedAt)} – ${formatDate(leftAt)}`;
}

export function MembershipHistory({
  memberships,
  showCurrent = true,
}: {
  memberships: MembershipRow[];
  showCurrent?: boolean;
}) {
  const { current, past } = splitMemberships(memberships);

  return (
    <div className="space-y-6">
      {showCurrent ? (
        <section className="space-y-3">
          <SectionHeader title="Está en" />
          {current.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin comité asignado ahora.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {current.map((item) => (
                <li
                  key={item.id}
                  className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-2 text-sm font-medium"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: item.committee.color }}
                    aria-hidden
                  />
                  <span>{item.committee.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {periodLabel(item.joinedAt, null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title="Perteneció a"
          description="Cambio de comité por semestre. El crédito de una asistencia usa los comités de ese día."
        />
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay comités anteriores.</p>
        ) : (
          <ol className="overflow-hidden rounded-xl border bg-card">
            {past.map((item) => (
              <li key={item.id} className="flex items-stretch">
                <span
                  className="w-1.5 shrink-0"
                  style={{ background: item.committee.color }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3">
                  <span className="font-medium truncate">{item.committee.name}</span>
                  <span className="tnum shrink-0 text-xs text-muted-foreground">
                    {periodLabel(item.joinedAt, item.leftAt)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
