import { listAuditLogs } from "@/server/domain/audit";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const logs = await listAuditLogs({ query: q, take: 80 });

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Auditoría"
        description="Cada decisión administrativa deja rastro. Los últimos 80 eventos."
      />

      <form className="flex flex-wrap gap-2" method="get" role="search">
        <Input
          name="q"
          placeholder="Acción, entidad o actor"
          defaultValue={q}
          aria-label="Buscar en la auditoría"
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {logs.length === 0 ? (
        <EmptyState
          title={q ? "Ningún evento coincide" : "Todavía no hay eventos"}
          description={
            q
              ? "Prueba con el nombre de la acción, el tipo de entidad o quien la ejecutó."
              : "Aquí queda registrado quién aprobó, asignó o cambió algo."
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {logs.map((log) => (
            <li key={log.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm font-medium">{log.action}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {log.actor?.fullName ?? "sistema"} · {log.entityType} ·{" "}
                <span className="font-mono text-xs">{log.entityId}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
