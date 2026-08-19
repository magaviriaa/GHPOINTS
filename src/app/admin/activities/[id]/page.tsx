import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";

import { getActivityById } from "@/server/domain/activities";
import { listActivityAttendances } from "@/server/domain/attendance";
import { listCommittees } from "@/server/domain/committees";
import { listMembers } from "@/server/domain/members";
import { listActivityCommitteeScores } from "@/server/domain/scoring";
import { getEnv } from "@/server/config/env";
import { roundRateDisplay } from "@/server/domain/scoring-pure";
import { toLocalInput, formatDateTime } from "@/lib/dates";
import { plural } from "@/lib/text";
import {
  adminAddAttendanceAction,
  adminApproveAttendanceAction,
  adminBulkApproveAction,
  adminBulkRejectAction,
  adminCancelAttendanceAction,
  adminDisableAttendanceTokenAction,
  adminRejectAttendanceAction,
  adminRotateQrAction,
  adminUpdateActivityAction,
} from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { ConfirmButton } from "@/components/forms/confirm-button";
import { Field, NativeSelect } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { DynamicQrControls } from "@/components/admin/dynamic-qr-controls";
import { ACTIVITY_STATUS, APPROVAL_MODE, ATTENDANCE_STATUS, optionsOf } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";

export default async function AdminActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; committee?: string; status?: string }>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const activity = await getActivityById(id);
  if (!activity) notFound();

  const [attendances, committees, members, scores] = await Promise.all([
    listActivityAttendances(activity.id, {
      query: filters.q,
      committeeId: filters.committee,
      status:
        filters.status === "PENDING" ||
        filters.status === "APPROVED" ||
        filters.status === "REJECTED" ||
        filters.status === "CANCELLED"
          ? filters.status
          : undefined,
    }),
    listCommittees(),
    listMembers({ status: "ACTIVE" }),
    listActivityCommitteeScores(activity.id),
  ]);

  const url = `${getEnv().APP_URL}/a/${activity.publicId}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 280 });
  const pendingIds = attendances.filter((row) => row.status === "PENDING").map((row) => row.id);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          href="/admin/activities"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Actividades
        </Link>
        <SectionHeader
          as="h1"
          title={activity.name}
          description={`${formatDateTime(activity.startsAt)} · +${activity.individualPoints} GH Points`}
          action={
            <div className="flex gap-2">
              <StatusBadge dictionary={ACTIVITY_STATUS} value={activity.status} />
              <StatusBadge dictionary={APPROVAL_MODE} value={activity.approvalMode} />
            </div>
          }
        />
      </div>

      <div className="grid gap-6 md:grid-cols-[288px_1fr]">
        <div className="rounded-xl border bg-card p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR de la actividad" className="mx-auto rounded-lg bg-white" />
          <p className="font-mono mt-3 text-center text-xs break-all text-muted-foreground">
            {url}
          </p>
          <ClientForm action={adminRotateQrAction} className="mt-3" successMessage="QR regenerado.">
            <input type="hidden" name="activityId" value={activity.id} />
            <SubmitButton variant="secondary" className="w-full" pendingLabel="Regenerando…">
              Regenerar QR público
            </SubmitButton>
          </ClientForm>
          {activity.publicIdHistory.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Códigos anteriores, ya inválidos:{" "}
              <span className="font-mono">
                {activity.publicIdHistory.map((row) => row.publicId).join(", ")}
              </span>
            </p>
          ) : null}
          <div className="mt-4 border-t pt-4">
            <DynamicQrControls
              activityId={activity.id}
              enabled={activity.requireAttendanceToken}
              staticUrl={url}
            />
            {activity.requireAttendanceToken ? (
              <ClientForm
                action={adminDisableAttendanceTokenAction}
                className="mt-2"
                successMessage="El enlace estático vuelve a funcionar."
              >
                <input type="hidden" name="activityId" value={activity.id} />
                <SubmitButton variant="secondary" className="w-full" pendingLabel="Aplicando…">
                  Volver a QR estático
                </SubmitButton>
              </ClientForm>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-display font-bold">Datos de la actividad</h2>
          <ClientForm
            action={adminUpdateActivityAction}
            className="mt-4 grid gap-4 md:grid-cols-2"
            successMessage="Actividad actualizada."
          >
            <input type="hidden" name="activityId" value={activity.id} />
            <Field label="Nombre" htmlFor="name" span>
              <Input id="name" name="name" defaultValue={activity.name} />
            </Field>
            <Field label="Inicio" htmlFor="startsAt">
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={toLocalInput(activity.startsAt)}
              />
            </Field>
            <Field label="Puntos" htmlFor="individualPoints">
              <Input
                id="individualPoints"
                name="individualPoints"
                type="number"
                defaultValue={activity.individualPoints}
              />
            </Field>
            <Field label="Registro desde" htmlFor="registrationStart">
              <Input
                id="registrationStart"
                name="registrationStart"
                type="datetime-local"
                defaultValue={toLocalInput(activity.registrationStart)}
              />
            </Field>
            <Field label="Registro hasta" htmlFor="registrationEnd">
              <Input
                id="registrationEnd"
                name="registrationEnd"
                type="datetime-local"
                defaultValue={toLocalInput(activity.registrationEnd)}
              />
            </Field>
            <Field label="Aprobación" htmlFor="approvalMode">
              <NativeSelect
                id="approvalMode"
                name="approvalMode"
                defaultValue={activity.approvalMode}
              >
                {optionsOf(APPROVAL_MODE).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label="Estado"
              htmlFor="status"
              hint="Cerrar congela el denominador del score de comité."
            >
              <NativeSelect id="status" name="status" defaultValue={activity.status}>
                {optionsOf(ACTIVITY_STATUS).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="md:col-span-2">
              <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>
            </div>
          </ClientForm>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title="Participación por comité"
          description="Asistentes acreditados sobre los integrantes elegibles."
        />
        {scores.length === 0 ? (
          <EmptyState title="El score se calcula cuando la actividad se cierra." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {scores.map((score) => (
              <li key={score.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ background: score.committee.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{score.committee.name}</span>
                <span className="tnum text-xs text-muted-foreground">
                  {Number(score.attendeeCredit).toFixed(1)}/{score.eligibleMemberCount}
                </span>
                <span className="tnum w-16 text-right font-bold">
                  {roundRateDisplay(Number(score.participationRate))}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Asistentes"
          description={`${plural(attendances.length, "registro")} con los filtros actuales`}
          action={
            <ExportLinks
              type="attendances"
              params={{ activityId: activity.id }}
              what="los asistentes de esta actividad"
            />
          }
        />

        <form className="flex flex-wrap items-end gap-3" method="get" role="search">
          <Field label="Buscar" htmlFor="q" className="min-w-48 flex-1">
            <Input id="q" name="q" placeholder="Nombre o correo" defaultValue={filters.q} />
          </Field>
          <Field label="Comité" htmlFor="committee">
            <NativeSelect
              id="committee"
              name="committee"
              defaultValue={filters.committee ?? ""}
              className="w-48"
            >
              <option value="">Todos</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Estado" htmlFor="status-filter">
            <NativeSelect
              id="status-filter"
              name="status"
              defaultValue={filters.status ?? ""}
              className="w-40"
            >
              <option value="">Todos</option>
              {optionsOf(ATTENDANCE_STATUS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {pendingIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
            <p className="tnum mr-auto text-sm">
              {plural(pendingIds.length, "registro")} pendientes de decisión.
            </p>
            <ClientForm action={adminBulkApproveAction} successMessage="Aprobados.">
              {pendingIds.map((attendanceId) => (
                <input
                  key={attendanceId}
                  type="hidden"
                  name="attendanceIds"
                  value={attendanceId}
                />
              ))}
              <SubmitButton size="sm" pendingLabel="Aprobando…">
                Aprobar todos los pendientes ({pendingIds.length})
              </SubmitButton>
            </ClientForm>
            <ConfirmButton
              size="sm"
              action={adminBulkRejectAction}
              formData={{ attendanceIds: pendingIds }}
              label="Rechazar todos los pendientes"
              title="Rechazar todos los pendientes"
              description={`Vas a rechazar ${plural(
                pendingIds.length,
                "registro"
              )} de esta actividad. No se acreditan GH Points y queda auditoría de cada uno.`}
              confirmLabel="Rechazar todos"
            />
          </div>
        ) : null}

        {attendances.length === 0 ? (
          <EmptyState title="Ningún registro con esos filtros." />
        ) : (
          <DataTable
            caption="Asistentes de la actividad"
            rows={attendances}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "member",
                header: "Integrante",
                primary: true,
                cell: (row) => <span className="font-medium">{row.member.fullName}</span>,
              },
              {
                key: "committees",
                header: "Comités",
                cell: (row) =>
                  row.member.committees.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    row.member.committees.map((item) => item.committee.name).join(", ")
                  ),
              },
              {
                key: "status",
                header: "Estado",
                cell: (row) => (
                  <StatusBadge dictionary={ATTENDANCE_STATUS} value={row.status} />
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                actions: true,
                cell: (row) => (
                  <div className="flex flex-wrap justify-end gap-2 md:justify-start">
                    {row.status !== "APPROVED" ? (
                      <ClientForm action={adminApproveAttendanceAction} successMessage="Aprobada.">
                        <input type="hidden" name="attendanceId" value={row.id} />
                        <SubmitButton size="sm" pendingLabel="…">
                          Aprobar
                        </SubmitButton>
                      </ClientForm>
                    ) : null}
                    {row.status === "PENDING" ? (
                      <ClientForm action={adminRejectAttendanceAction} successMessage="Rechazada.">
                        <input type="hidden" name="attendanceId" value={row.id} />
                        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                          Rechazar
                        </SubmitButton>
                      </ClientForm>
                    ) : null}
                    {row.status !== "CANCELLED" ? (
                      <ClientForm action={adminCancelAttendanceAction} successMessage="Anulada.">
                        <input type="hidden" name="attendanceId" value={row.id} />
                        <input type="hidden" name="reason" value="Anulación administrativa" />
                        <SubmitButton size="sm" variant="destructive" pendingLabel="…">
                          Anular
                        </SubmitButton>
                      </ClientForm>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        )}

        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-display font-bold">Registrar a alguien a mano</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para quien asistió pero no alcanzó a escanear. Queda con origen «registro manual».
          </p>
          <ClientForm
            action={adminAddAttendanceAction}
            className="mt-3 flex flex-wrap items-end gap-3"
            successMessage="Asistencia agregada."
          >
            <input type="hidden" name="activityId" value={activity.id} />
            <Field label="Integrante" htmlFor="memberId" className="min-w-56">
              <NativeSelect id="memberId" name="memberId" required>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <SubmitButton pendingLabel="Agregando…">Agregar asistencia</SubmitButton>
          </ClientForm>
        </div>
      </section>
    </div>
  );
}
