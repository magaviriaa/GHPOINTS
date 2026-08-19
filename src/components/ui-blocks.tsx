import Link from "next/link";

import { cn } from "@/lib/utils";
import { metalForLevel, levelScale } from "@/lib/level-style";
import type { LevelProgress } from "@/server/domain/levels-pure";

export function SectionHeader({
  title,
  description,
  action,
  as: Tag = "h2",
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag
          className={cn(
            "font-display tracking-tight",
            Tag === "h1" ? "text-2xl font-extrabold sm:text-3xl" : "text-lg font-bold"
          )}
        >
          {title}
        </Tag>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * La firma: la cifra que importa, en Archivo ancha con numerales tabulares.
 * Se usa en tres momentos y en ninguno más — puntos, posición y el crédito de
 * una actividad al registrarla.
 */
export function Marcador({
  label,
  value,
  unit,
  hint,
  size = "md",
  onBand = false,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  size?: "md" | "lg";
  onBand?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        className={cn(
          "text-[0.6875rem] font-semibold tracking-[0.14em] uppercase",
          onBand ? "text-banda-tenue" : "text-muted-foreground"
        )}
      >
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "marcador",
            size === "lg" ? "text-[clamp(3rem,14vw,4.5rem)]" : "text-[clamp(2.25rem,9vw,3rem)]"
          )}
        >
          {value}
        </span>
        {unit ? (
          <span
            className={cn(
              "text-sm font-semibold",
              onBand ? "text-banda-tenue" : "text-muted-foreground"
            )}
          >
            {unit}
          </span>
        ) : null}
      </p>
      {hint ? (
        <p className={cn("mt-1 text-sm", onBand ? "text-banda-tenue" : "text-muted-foreground")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * La pista de nivel. El dominio ya calculaba `progress` y nadie lo veía.
 * Cada tramo es un metal, en el mismo orden que la regla bajo la banda.
 */
export function LevelTrack({
  level,
  points,
  onBand = false,
  className,
}: {
  level: LevelProgress;
  points: number;
  onBand?: boolean;
  className?: string;
}) {
  const levels = levelScale();
  const currentIndex = levels.findIndex((item) => item.slug === level.current.slug);
  const remaining = level.next ? Math.max(0, level.next.minPoints - points) : 0;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex gap-1" aria-hidden>
        {levels.map((item, index) => {
          const filled = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div
              key={item.slug}
              className={cn(
                "h-1.5 flex-1 overflow-hidden rounded-full",
                onBand ? "bg-white/15" : "bg-secondary"
              )}
            >
              {filled || isCurrent ? (
                <div
                  className="h-full rounded-full"
                  style={{
                    background: item.metal,
                    width: filled ? "100%" : `${Math.max(6, level.progress * 100)}%`,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p
        className={cn(
          "mt-2 flex flex-wrap items-center gap-x-2 text-sm",
          onBand ? "text-banda-tenue" : "text-muted-foreground"
        )}
      >
        <span
          className="inline-flex items-center gap-1.5 font-semibold"
          style={{ color: onBand ? undefined : metalForLevel(level.current.slug) }}
        >
          <span
            className="size-2 rounded-full"
            style={{ background: metalForLevel(level.current.slug) }}
            aria-hidden
          />
          Nivel {level.current.name}
        </span>
        {level.next ? (
          <span>
            · faltan <span className="tnum font-semibold">{remaining}</span> para{" "}
            {level.next.name}
          </span>
        ) : (
          <span>· nivel máximo</span>
        )}
      </p>
    </div>
  );
}

/** Filtro de periodo o alcance: se ve y se toca como un control, no como texto. */
export function SegmentedLinks({
  label,
  items,
  className,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            item.active
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed bg-card px-6 py-10 text-center",
        className
      )}
    >
      <p className="font-display font-bold text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        accent && "border-transparent ring-2 ring-primary/25"
      )}
    >
      <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-display tnum mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function BarList({
  items,
  unit = "",
  emptyLabel = "Sin datos todavía.",
}: {
  items: Array<{ id: string; label: string; value: number; color?: string }>;
  unit?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-muted-foreground">{item.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, (item.value / max) * 100)}%`,
                background: item.color ?? "var(--primary)",
              }}
            />
          </span>
          <span className="tnum w-16 text-right font-semibold">
            {item.value}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Initials({
  name,
  color,
  className,
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "font-display inline-flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
        className
      )}
      style={{ background: color || "var(--tinta)" }}
      aria-hidden
    >
      {letters || "?"}
    </span>
  );
}

export function ErrorState({
  title = "Esta sección no cargó",
  description = "La conexión con el servidor falló. Vuelve a intentarlo; si sigue igual, avisa a GH General.",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-card px-6 py-10 text-center"
    >
      <p className="font-display text-lg font-bold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-xl bg-secondary", className)} aria-hidden />
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <SkeletonBlock className="h-28" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
      <SkeletonBlock className="h-56" />
    </div>
  );
}
