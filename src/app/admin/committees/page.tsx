import Link from "next/link";

import { listCommittees } from "@/server/domain/committees";
import { adminCreateCommitteeAction, adminUpdateCommitteeAction } from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { COMMITTEE_STATUS, optionsOf } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";

export default async function AdminCommitteesPage() {
  const committees = await listCommittees();

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Comités"
        description="El color identifica al comité en rankings, roster y actividades."
      />

      <Disclosure title="Crear comité">
        <ClientForm
          action={adminCreateCommitteeAction}
          className="flex flex-wrap items-end gap-3"
          successMessage="Comité creado."
          resetOnSuccess
        >
          <Field label="Nombre" htmlFor="name" className="min-w-48 flex-1">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Color" htmlFor="color">
            <Input id="color" name="color" type="color" defaultValue="#1d3fe0" className="h-9 w-16 p-1" />
          </Field>
          <SubmitButton pendingLabel="Creando…">Crear</SubmitButton>
        </ClientForm>
      </Disclosure>

      {committees.length === 0 ? (
        <EmptyState
          title="Todavía no hay comités"
          description="Crea el primero para poder asignar integrantes y calcular participación."
        />
      ) : (
        <ul className="space-y-3">
          {committees.map((committee) => (
            <li key={committee.id} className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span
                  className="h-6 w-1.5 shrink-0 rounded-full"
                  style={{ background: committee.color }}
                  aria-hidden
                />
                <Link
                  className="font-display font-bold hover:underline"
                  href={`/app/rankings/committees/${committee.slug}`}
                >
                  {committee.name}
                </Link>
                <StatusBadge dictionary={COMMITTEE_STATUS} value={committee.status} />
                <span className="tnum ml-auto text-sm text-muted-foreground">
                  {committee._count.memberships} integrantes
                </span>
              </div>
              <ClientForm
                action={adminUpdateCommitteeAction}
                className="flex flex-wrap items-end gap-3"
                successMessage="Comité actualizado."
              >
                <input type="hidden" name="committeeId" value={committee.id} />
                <Field label="Nombre" htmlFor={`name-${committee.id}`} className="min-w-44 flex-1">
                  <Input id={`name-${committee.id}`} name="name" defaultValue={committee.name} />
                </Field>
                <Field label="Color" htmlFor={`color-${committee.id}`}>
                  <Input
                    id={`color-${committee.id}`}
                    name="color"
                    type="color"
                    defaultValue={committee.color}
                    className="h-9 w-16 p-1"
                  />
                </Field>
                <Field label="Estado" htmlFor={`status-${committee.id}`}>
                  <NativeSelect
                    id={`status-${committee.id}`}
                    name="status"
                    defaultValue={committee.status}
                    className="w-36"
                  >
                    {optionsOf(COMMITTEE_STATUS).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <SubmitButton variant="secondary" pendingLabel="Guardando…">
                  Guardar
                </SubmitButton>
              </ClientForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
