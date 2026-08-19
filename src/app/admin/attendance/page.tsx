import Link from "next/link";

import { getActiveSeason } from "@/server/domain/season";
import { listPendingAttendances } from "@/server/domain/attendance";
import {
  adminApproveAttendanceAction,
  adminBulkRejectAction,
  adminRejectAttendanceAction,
} from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { ATTENDANCE_SOURCE } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, Initials, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";
import { formatDateTime } from "@/lib/dates";
import { plural } from "@/lib/text";

export default async function AdminAttendancePage() {
  const season = await getActiveSeason();
  const pending = await listPendingAttendances(season?.id);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Asistencias pendientes"
        description="Registros de actividades con aprobación manual. Aprobar acredita los GH Points y avisa al integrante."
        action={<ExportLinks type="attendances" what="las asistencias" />}
      />

      {pending.length === 0 ? (
        <EmptyState
          title="No hay nada pendiente"
          description="Las actividades con aprobación automática acreditan al registrar; aquí solo llega lo que pediste revisar."
          action={
            <Link
              href="/admin/activities"
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver actividades
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="tnum text-sm text-muted-foreground">
              {plural(pending.length, "registro")} esperando decisión
            </p>
            <ConfirmButton
              action={adminBulkRejectAction}
              formData={{ attendanceIds: pending.map((row) => row.id) }}
              label={`Rechazar todos (${pending.length})`}
              title="Rechazar todos los pendientes"
              description={`Vas a rechazar ${plural(
                pending.length,
                "registro"
              )} de una vez. No se acreditan GH Points y queda una entrada de auditoría por cada uno. Una asistencia rechazada no se vuelve a aprobar desde aquí: se corrige con un ajuste manual.`}
              confirmLabel="Rechazar todos"
            />
          </div>

          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <Initials name={row.member.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.member.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.activity.name} · {formatDateTime(row.registeredAt)}
                  </p>
                </div>
                <StatusBadge dictionary={ATTENDANCE_SOURCE} value={row.source} />
                <div className="flex gap-2">
                  <ClientForm action={adminApproveAttendanceAction} successMessage="Aprobada.">
                    <input type="hidden" name="attendanceId" value={row.id} />
                    <SubmitButton size="sm" pendingLabel="Aprobando…">
                      Aprobar
                    </SubmitButton>
                  </ClientForm>
                  <ClientForm action={adminRejectAttendanceAction} successMessage="Rechazada.">
                    <input type="hidden" name="attendanceId" value={row.id} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Rechazando…">
                      Rechazar
                    </SubmitButton>
                  </ClientForm>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
