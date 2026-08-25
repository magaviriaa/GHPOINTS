import Link from "next/link";

import { getActiveSeason } from "@/server/domain/season";
import { listPendingAttendances } from "@/server/domain/attendance";
import { listActivities } from "@/server/domain/activities";
import { listCommittees } from "@/server/domain/committees";
import { adminBulkApproveAction, adminBulkRejectAction } from "@/server/actions/admin";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";
import {
  AttendanceSelection,
  type AttendanceSelectionRow,
} from "@/components/admin/attendance-selection";
import { plural } from "@/lib/text";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; committee?: string; activity?: string }>;
}) {
  const filters = await searchParams;
  const season = await getActiveSeason();
  const [pending, committees, activities] = await Promise.all([
    listPendingAttendances({
      seasonId: season?.id,
      query: filters.q,
      committeeId: filters.committee,
      activityId: filters.activity,
    }),
    listCommittees(),
    listActivities({ seasonId: season?.id }),
  ]);
  const pendingIds = pending.map((row) => row.id);
  const rows: AttendanceSelectionRow[] = pending.map((row) => ({
    id: row.id,
    registeredAt: row.registeredAt,
    source: row.source,
    status: "PENDING",
    member: {
      fullName: row.member.fullName,
      institutionalEmail: row.member.institutionalEmail,
    },
    activity: { name: row.activity.name },
  }));

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Asistencias pendientes"
        description="Busca, selecciona y decide registros de actividades con aprobación manual."
        action={<ExportLinks type="attendances" what="las asistencias" />}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4" method="get" role="search">
        <Field label="Buscar" htmlFor="q" className="min-w-52 flex-1">
          <Input id="q" name="q" type="search" placeholder="Nombre o correo institucional" defaultValue={filters.q} />
        </Field>
        <Field label="Comité" htmlFor="committee" className="min-w-48">
          <NativeSelect id="committee" name="committee" defaultValue={filters.committee ?? ""}>
            <option value="">Todos</option>
            {committees.map((committee) => (
              <option key={committee.id} value={committee.id}>{committee.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Actividad" htmlFor="activity" className="min-w-52">
          <NativeSelect id="activity" name="activity" defaultValue={filters.activity ?? ""}>
            <option value="">Todas</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>{activity.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" variant="secondary">Filtrar</Button>
        {filters.q || filters.committee || filters.activity ? (
          <Button asChild type="button" variant="ghost"><Link href="/admin/attendance">Limpiar</Link></Button>
        ) : null}
      </form>

      {pending.length === 0 ? (
        <EmptyState
          title="No hay nada pendiente con esos filtros"
          description="Las actividades automáticas acreditan al registrar; aquí solo aparece lo que necesita revisión."
          action={<Link href="/admin/activities" className="text-sm font-medium text-primary hover:underline">Ver actividades</Link>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="tnum mr-auto text-sm text-muted-foreground">{plural(pending.length, "registro")} esperando decisión</p>
            <ConfirmButton
              action={adminBulkApproveAction}
              formData={{ attendanceIds: pendingIds }}
              label={`Aprobar todos (${pending.length})`}
              title="Aprobar todos los resultados visibles"
              description={`Se aprobarán ${plural(pending.length, "registro")} y se acreditarán sus GH Points. El lote se aplica completo o no se aplica.`}
              confirmLabel="Aprobar todos"
              confirmVariant="default"
            />
            <ConfirmButton
              action={adminBulkRejectAction}
              formData={{ attendanceIds: pendingIds }}
              label={`Rechazar todos (${pending.length})`}
              title="Rechazar todos los resultados visibles"
              description={`Se rechazarán ${plural(pending.length, "registro")} sin acreditar GH Points. Quedará una entrada de auditoría por registro.`}
              confirmLabel="Rechazar todos"
            />
          </div>
          <AttendanceSelection rows={rows} showActivity />
        </>
      )}
    </div>
  );
}
