import Link from "next/link";

import { listActivities, listProposedActivities } from "@/server/domain/activities";
import {
  adminCreateActivityAction,
  adminPublishProposalAction,
  adminRejectProposalAction,
} from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { formatDateTime } from "@/lib/dates";
import { ACTIVITY_STATUS, APPROVAL_MODE, optionsOf } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";
import { ExportLinks } from "@/components/admin/export-links";

export default async function AdminActivitiesPage() {
  const [activities, proposals] = await Promise.all([listActivities(), listProposedActivities()]);

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Actividades"
        description="Publicar una actividad abre su registro y genera el QR."
        action={<ExportLinks type="activity" what="las actividades" />}
      />

      {proposals.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-4">
          <div>
            <h2 className="font-display font-bold">Cola de aprobación</h2>
            <p className="text-sm text-muted-foreground">
              Propuestas de líderes de comité. Publicar abre el registro de inmediato.
            </p>
          </div>
          <ul className="divide-y">
            {proposals.map((activity) => (
              <li
                key={activity.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{activity.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.committee?.name ?? "Sin comité"} · propuesta por{" "}
                    {activity.createdBy.fullName} · +{activity.individualPoints} pts
                  </p>
                </div>
                <div className="flex gap-2">
                  <ClientForm action={adminPublishProposalAction} successMessage="Publicada.">
                    <input type="hidden" name="activityId" value={activity.id} />
                    <SubmitButton size="sm" pendingLabel="Publicando…">
                      Publicar
                    </SubmitButton>
                  </ClientForm>
                  <ClientForm action={adminRejectProposalAction} successMessage="Rechazada.">
                    <input type="hidden" name="activityId" value={activity.id} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Rechazando…">
                      Rechazar
                    </SubmitButton>
                  </ClientForm>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Disclosure title="Crear actividad" defaultOpen>
        <ClientForm
          action={adminCreateActivityAction}
          className="grid gap-4 md:grid-cols-2"
          successMessage="Actividad creada. El QR ya está disponible en su detalle."
        >
          <Field label="Nombre" htmlFor="name" span>
            <Input id="name" name="name" required placeholder="Athletic Masculino vs Clubmerc" />
          </Field>
          <Field label="Descripción" htmlFor="description" span>
            <Textarea id="description" name="description" />
          </Field>
          <Field label="Inicio" htmlFor="startsAt">
            <Input id="startsAt" name="startsAt" type="datetime-local" required />
          </Field>
          <Field label="GH Points individuales" htmlFor="individualPoints">
            <Input
              id="individualPoints"
              name="individualPoints"
              type="number"
              defaultValue={20}
              required
            />
          </Field>
          <Field label="Registro desde" htmlFor="registrationStart">
            <Input
              id="registrationStart"
              name="registrationStart"
              type="datetime-local"
              required
            />
          </Field>
          <Field label="Registro hasta" htmlFor="registrationEnd">
            <Input id="registrationEnd" name="registrationEnd" type="datetime-local" required />
          </Field>
          <Field
            label="Aprobación"
            htmlFor="approvalMode"
            hint="Automática acredita al registrar; manual pasa por la cola de asistencias."
          >
            <NativeSelect id="approvalMode" name="approvalMode">
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
            hint="En borrador nadie puede registrarse todavía."
          >
            <NativeSelect id="status" name="status">
              <option value="OPEN">{ACTIVITY_STATUS.OPEN.label}</option>
              <option value="DRAFT">{ACTIVITY_STATUS.DRAFT.label}</option>
            </NativeSelect>
          </Field>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Creando…">Crear y generar QR</SubmitButton>
          </div>
        </ClientForm>
      </Disclosure>

      {activities.length === 0 ? (
        <EmptyState
          title="No hay actividades en la temporada activa"
          description="Crea la primera arriba, o publica una propuesta de comité."
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {activities.map((activity) => (
            <li key={activity.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  className="font-medium hover:underline"
                  href={`/admin/activities/${activity.id}`}
                >
                  {activity.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(activity.startsAt)} · {activity._count.attendances} registros
                </p>
              </div>
              <StatusBadge dictionary={ACTIVITY_STATUS} value={activity.status} />
              <span className="tnum w-12 text-right text-sm font-bold text-accent-ink">
                +{activity.individualPoints}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
