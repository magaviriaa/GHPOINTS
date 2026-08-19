import { listSeasons } from "@/server/domain/season";
import { adminCreateSeasonAction, adminUpdateSeasonStatusAction } from "@/server/actions/admin";
import { ClientForm, SubmitButton } from "@/components/forms/client-form";
import { Field, NativeSelect } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { formatDate } from "@/lib/dates";
import { SEASON_STATUS, optionsOf } from "@/lib/labels";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, SectionHeader } from "@/components/ui-blocks";

export default async function AdminSeasonsPage() {
  const seasons = await listSeasons();

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        title="Temporadas"
        description="Solo una puede estar en curso. Cerrar una no borra nada: congela su foto."
      />

      <Disclosure title="Crear temporada">
        <ClientForm
          action={adminCreateSeasonAction}
          className="grid gap-3 md:grid-cols-4"
          successMessage="Temporada creada."
          resetOnSuccess
        >
          <Field label="Nombre" htmlFor="name">
            <Input id="name" name="name" placeholder="2027-1" required />
          </Field>
          <Field label="Inicio" htmlFor="startDate">
            <Input id="startDate" name="startDate" type="date" required />
          </Field>
          <Field label="Fin" htmlFor="endDate">
            <Input id="endDate" name="endDate" type="date" required />
          </Field>
          <Field label="Estado" htmlFor="status">
            <NativeSelect id="status" name="status">
              <option value="UPCOMING">Próxima</option>
              <option value="ACTIVE">En curso</option>
            </NativeSelect>
          </Field>
          <div className="md:col-span-4">
            <SubmitButton pendingLabel="Creando…">Crear</SubmitButton>
          </div>
        </ClientForm>
      </Disclosure>

      {seasons.length === 0 ? (
        <EmptyState title="Todavía no hay temporadas." />
      ) : (
        <ul className="space-y-3">
          {seasons.map((season) => (
            <li
              key={season.id}
              className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold">{season.name}</p>
                  <StatusBadge dictionary={SEASON_STATUS} value={season.status} />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatDate(season.startDate)} — {formatDate(season.endDate)}
                </p>
              </div>
              <ClientForm
                action={adminUpdateSeasonStatusAction}
                className="flex items-end gap-2"
                successMessage="Estado actualizado."
              >
                <input type="hidden" name="seasonId" value={season.id} />
                <Field label="Estado" htmlFor={`status-${season.id}`}>
                  <NativeSelect
                    id={`status-${season.id}`}
                    name="status"
                    defaultValue={season.status}
                    className="w-36"
                  >
                    {optionsOf(SEASON_STATUS).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <SubmitButton variant="secondary" pendingLabel="Aplicando…">
                  Actualizar
                </SubmitButton>
              </ClientForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
