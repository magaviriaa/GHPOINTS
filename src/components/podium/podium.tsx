import Link from "next/link";

import { cn } from "@/lib/utils";
import { Initials } from "@/components/ui-blocks";

export type PodiumItem = {
  id: string;
  name: string;
  total: number;
  subtitle?: string;
  color?: string;
  href?: string;
};

const METAL = {
  1: "var(--metal-oro)",
  2: "var(--metal-plata)",
  3: "var(--metal-bronce)",
} as const;

/**
 * Representación de los tres primeros. La lista de abajo es la fuente para
 * lector de pantalla, así que el podio va oculto para no leer dos veces lo mismo.
 */
export function Podium({ items, unit = "pts" }: { items: PodiumItem[]; unit?: string }) {
  const [first, second, third] = items;
  if (!first) return null;

  return (
    <div className="grid grid-cols-3 items-end gap-2 px-2 pt-4 pb-1" aria-hidden>
      <PodiumSlot item={second} place={2} height="h-16" unit={unit} />
      <PodiumSlot item={first} place={1} height="h-24" unit={unit} featured />
      <PodiumSlot item={third} place={3} height="h-12" unit={unit} />
    </div>
  );
}

function PodiumSlot({
  item,
  place,
  height,
  unit,
  featured,
}: {
  item?: PodiumItem;
  place: 1 | 2 | 3;
  height: string;
  unit: string;
  featured?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-2", !item && "opacity-40")}>
      {item ? (
        <Initials name={item.name} color={item.color} className={featured ? "size-12" : undefined} />
      ) : (
        <div className="size-10 rounded-full bg-muted" />
      )}
      <p className="w-full truncate text-center text-sm font-semibold">{item?.name ?? "—"}</p>
      <p
        className={cn(
          "tnum text-sm font-bold",
          featured ? "text-accent-ink" : "text-muted-foreground"
        )}
      >
        {item ? formatTotal(item.total, unit) : ""}
      </p>
      <div
        className={cn("flex w-full items-start justify-center rounded-t-lg pt-1.5", height)}
        style={{ background: METAL[place] }}
      >
        <span className="font-display text-sm font-extrabold text-tinta/70">{place}</span>
      </div>
    </div>
  );
}

function formatTotal(total: number, unit: string) {
  if (unit === "%") return `${(total * 100).toFixed(1)}%`;
  return `${total} ${unit}`;
}

export function RankingList({
  items,
  unit = "pts",
  highlightId,
}: {
  items: Array<PodiumItem & { rank: number }>;
  unit?: string;
  highlightId?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => {
        const inner = (
          <>
            <span
              className={cn(
                "font-display tnum w-7 shrink-0 text-right text-sm font-extrabold",
                item.rank <= 3 ? "text-accent-ink" : "text-muted-foreground"
              )}
            >
              {item.rank}
            </span>
            {item.color ? (
              <span
                className="h-6 w-1 shrink-0 rounded-full"
                style={{ background: item.color }}
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              {item.subtitle ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.subtitle}
                </span>
              ) : null}
            </span>
            <span className="tnum shrink-0 text-sm font-bold">
              {formatTotal(item.total, unit)}
            </span>
          </>
        );

        return (
          <li
            key={item.id}
            className={cn(
              item.id === highlightId && "bg-primary/5 ring-1 ring-primary/25 ring-inset"
            )}
          >
            {item.href ? (
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
